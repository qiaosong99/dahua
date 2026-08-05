/**
 * 大华设备对接抽象层 (DH-ASI7213X-T)
 *
 * 通过设备 HTTP 协议对接：
 *   1. global.login 登录设备（支持明文密码与 digest 摘要两种认证）
 *   2. userManager.addUserInfo 添加用户
 *   3. faceInfoServer.cgi 下发人脸照片
 *   4. userManager.deleteUserInfo 删除用户（同时清除人脸凭证）
 *
 * 所有方法统一返回 { ok: boolean, message: string }，
 * 若真机联调时 HTTP 协议不可用，可在本层替换为 NetSDK 网关实现，业务代码无需改动。
 */
const crypto = require('crypto');
const { loadConfig } = require('./utils/configLoader');

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').toLowerCase();

function deviceUrl(device, pathname) {
  const scheme = device.https ? 'https' : 'http';
  return `${scheme}://${device.host}:${device.port}${pathname}`;
}

async function postJson(url, body, session, timeoutMs = 15000) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request': 'JSON'
  };
  if (session) headers['X-Subject'] = `session=${session}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* 非 JSON 响应 */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(device, method, params, session) {
  const body = {
    method,
    id: Math.floor(Math.random() * 100000) + 1,
    params: params || {},
    session: session || 0
  };
  return postJson(deviceUrl(device, '/RPC2'), body, session);
}

/**
 * 登录设备，返回 session id
 * 兼容多种固件：明文密码 + 多种 clientType，失败时回退 digest 摘要认证
 */
async function login(device) {
  // 第一步：尝试明文密码登录（多种 clientType 兼容不同固件）
  let lastErr = null;
  for (const clientType of ['Dahua3.0-Web3.0', 'NetSDK']) {
    const r = await rpcCall(device, 'global.login', {
      userName: device.username,
      password: device.password,
      clientType,
      loginType: 'Direct'
    });
    if (r.json && r.json.result === true && r.json.session) {
      return r.json.session;
    }
    lastErr = r;
    // 需要摘要认证时不再尝试其他 clientType
    const err = r.json && r.json.error;
    if (err && (err.code === 401 || err.code === 403) && err.params) break;
  }

  // 第二步：摘要认证（设备返回 401 + realm/random）
  const err = lastErr && lastErr.json && lastErr.json.error;
  if (err && (err.code === 401 || err.code === 403) && err.params) {
    const realm = err.params.realm;
    const randomization = err.params.randomization || err.params.random;
    if (realm && randomization) {
      const hash1 = md5(`${device.username}:${realm}:${device.password}`);
      const digest = md5(`${device.username}:${randomization}:${hash1}`);
      const r = await rpcCall(device, 'global.login', {
        userName: device.username,
        password: digest,
        clientType: 'Dahua3.0-Web3.0'
      });
      if (r.json && r.json.result === true && r.json.session) {
        return r.json.session;
      }
      lastErr = r;
    }
  }

  const msg = lastErr && lastErr.json && lastErr.json.error
    ? `code=${lastErr.json.error.code} ${lastErr.json.error.message || ''}`
    : ((lastErr && lastErr.text) || '').slice(0, 200);
  throw new Error(`设备登录失败: ${msg}`);
}

/**
 * 以 multipart 方式调用设备 CGI 接口
 */
async function cgiMultipart(device, session, cgiPath, jsonPart, imageBuffer) {
  const boundary = '----visitorAccess' + Date.now().toString(36);
  const head = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="FaceInfoRecord"\r\n' +
    'Content-Type: text/json\r\n\r\n' +
    JSON.stringify(jsonPart) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="image"; filename="face.jpg"\r\n' +
    'Content-Type: image/jpeg\r\n\r\n',
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, imageBuffer, tail]);

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Accept': 'application/json'
  };
  if (session) headers['X-Subject'] = `session=${session}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(deviceUrl(device, cgiPath), {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* ignore */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function ensureConfigured() {
  const cfg = loadConfig();
  const d = cfg.device;
  if (!d || !d.host) {
    throw new Error('门禁机未配置：请先在 server/config.json 中填写 device.host 等参数');
  }
  return d;
}

/**
 * 连通性测试
 */
async function testConnection() {
  try {
    const device = ensureConfigured();
    // 先做 TCP 层探测，给出更明确的诊断信息
    const net = require('net');
    const open = await new Promise((resolve) => {
      const s = new net.Socket();
      let done = false;
      const finish = (v) => { if (!done) { done = true; s.destroy(); resolve(v); } };
      s.setTimeout(3000);
      s.once('connect', () => finish(true));
      s.once('timeout', () => finish(false));
      s.once('error', () => finish(false));
      s.connect(device.port, device.host);
    });
    if (!open) {
      return {
        ok: false,
        message: `无法连接到门禁机 ${device.host}:${device.port}（TCP 超时）。请检查设备网线是否接入与服务器同一局域网、设备是否通电启动、IP 是否正确`
      };
    }
    const session = await login(device);
    // 查询设备信息验证会话可用
    const r = await rpcCall(device, 'magicBox.getSystemInfo', {}, session);
    await logoutQuietly(device, session);
    const info = r.json && r.json.params ? r.json.params : null;
    return {
      ok: true,
      message: `连接成功${info && info.machine ? '，设备型号: ' + info.machine : ''}${info && info.softWareVersion ? '，固件: ' + info.softWareVersion : ''}`
    };
  } catch (e) {
    const m = e.message || String(e);
    const hint = /fetch failed|ETIMEDOUT|ECONNREFUSED|ECONNRESET|abort/i.test(m)
      ? '（网络层失败：请确认设备与服务器在同一局域网且 HTTP 服务已开启）'
      : '';
    return { ok: false, message: m + hint };
  }
}

async function logoutQuietly(device, session) {
  try { await rpcCall(device, 'global.logout', {}, session); } catch (_) { /* ignore */ }
}

/**
 * 添加访客用户 + 下发人脸
 * @param {string} userId 设备用户ID（如 V1730000000000）
 * @param {string} name 姓名
 * @param {Buffer} imageBuffer JPEG 照片
 */
async function addFaceUser(userId, name, imageBuffer) {
  const device = ensureConfigured();
  const session = await login(device);
  try {
    // 1. 添加用户信息
    const addRes = await rpcCall(device, 'userManager.addUserInfo', {
      userInfo: {
        UserID: userId,
        Name: name,
        UserType: 'General',
        Gender: 'Unknown',
        DoorRight: '1',
        RightPlan: [{ DoorNo: 1, PlanTemplateNo: '1' }]
      }
    }, session);
    if (!addRes.json || addRes.json.result !== true) {
      const em = addRes.json && addRes.json.error
        ? `code=${addRes.json.error.code} ${addRes.json.error.message || ''}`
        : (addRes.text || '').slice(0, 200);
      throw new Error(`添加用户信息失败: ${em}`);
    }

    // 2. 下发人脸照片
    const faceRes = await cgiMultipart(device, session, '/cgi-bin/faceInfoServer.cgi', {
      Action: 'AddUserFace',
      Info: {
        UserID: userId,
        Name: name,
        GroupID: 1
      }
    }, imageBuffer);
    if (faceRes.status !== 200 || (faceRes.json && faceRes.json.result === false)) {
      const em = faceRes.json && faceRes.json.error
        ? `code=${faceRes.json.error.code} ${faceRes.json.error.message || ''}`
        : (faceRes.text || '').slice(0, 200);
      // 回滚：删除刚建的用户
      try {
        await rpcCall(device, 'userManager.deleteUserInfo', { UserID: userId }, session);
      } catch (_) { /* ignore */ }
      throw new Error(`下发人脸失败: ${em}`);
    }
    return { ok: true, message: '人脸权限下发成功' };
  } finally {
    await logoutQuietly(device, session);
  }
}

/**
 * 删除访客用户（同时清除设备上的人脸凭证）
 */
async function removeFaceUser(userId) {
  const device = ensureConfigured();
  const session = await login(device);
  try {
    const r = await rpcCall(device, 'userManager.deleteUserInfo', { UserID: userId }, session);
    if (!r.json || r.json.result !== true) {
      const em = r.json && r.json.error
        ? `code=${r.json.error.code} ${r.json.error.message || ''}`
        : (r.text || '').slice(0, 200);
      throw new Error(`删除设备用户失败: ${em}`);
    }
    return { ok: true, message: '设备人脸权限已回收' };
  } finally {
    await logoutQuietly(device, session);
  }
}

module.exports = { testConnection, addFaceUser, removeFaceUser };
