/**
 * 大华设备对接抽象层 (DH-ASI7213X-T) —— NetSDK 网关版
 *
 * 设备固件关闭了 HTTP /RPC2 接口，因此通过 dh-netsdk-http 网关（Java/NetSDK）对接：
 *   1. GET  /gate/ping          登录设备验证连通性
 *   2. POST /gate/addUserFace   创建用户并下发人脸（失败自动回滚）
 *   3. POST /gate/deleteUserFace 删除人脸凭证并删除用户
 *
 * 网关请求需携带设备凭据头（AES 加密密码 + epoch 微秒时间戳，防重放）。
 * 所有方法统一返回 { ok: boolean, message: string }，业务代码无需感知网关细节。
 */
const crypto = require('crypto');
const net = require('net');
const { loadConfig } = require('./utils/configLoader');

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8090/dh-netsdk';
const DEFAULT_AES_KEY = 'NetSDK1234567890';
const DEFAULT_NETSDK_PORT = 37777;

function getGatewayCfg() {
  const cfg = loadConfig();
  const gw = cfg.gateway || {};
  return {
    url: (gw.url || DEFAULT_GATEWAY_URL).replace(/\/$/, ''),
    aesKey: gw.aesKey || DEFAULT_AES_KEY,
    devicePort: gw.devicePort || DEFAULT_NETSDK_PORT,
    device: cfg.device || {}
  };
}

/**
 * 生成网关要求的设备凭据请求头
 * Dh-Device-Password = AES-128-ECB/PKCS5 加密 "密码|epoch微秒时间戳" 后 Base64
 */
function buildDeviceHeaders(gw) {
  const ts = String(Date.now() * 1000);
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(gw.aesKey, 'utf8'), null);
  const enc = Buffer.concat([
    cipher.update(`${gw.device.password}|${ts}`, 'utf8'),
    cipher.final()
  ]).toString('base64');
  return {
    'Dh-Device-Ip': gw.device.host,
    'Dh-Device-User': gw.device.username || 'admin',
    'Dh-Device-Password': enc,
    'Dh-Device-Timestamp': ts,
    'Dh-Device-Port': String(gw.devicePort)
  };
}

async function gatewayCall(gw, method, path, body, timeoutMs = 20000) {
  const headers = { ...buildDeviceHeaders(gw) };
  const opts = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  opts.signal = ctrl.signal;
  try {
    const res = await fetch(`${gw.url}${path}`, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* 非 JSON 响应 */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function ensureConfigured() {
  const gw = getGatewayCfg();
  if (!gw.device || !gw.device.host) {
    throw new Error('门禁机未配置：请先在 server/config.json 中填写 device.host 等参数');
  }
  if (!gw.device.password) {
    throw new Error('门禁机密码未配置：请填写 device.password');
  }
  return gw;
}

async function tcpProbe(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (v) => { if (!done) { done = true; s.destroy(); resolve(v); } };
    s.setTimeout(timeoutMs);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false));
    s.once('error', () => finish(false));
    s.connect(port, host);
  });
}

/**
 * 解析网关响应为统一的 { ok, message }
 */
function toResult(r, okMsgPrefix) {
  if (r.json && typeof r.json.success === 'boolean') {
    return { ok: r.json.success, message: r.json.message || (r.json.success ? okMsgPrefix : '操作失败') };
  }
  // HTTP 400 通常为请求头校验/设备登录失败，网关直接返回文本原因
  return { ok: false, message: (r.text || `HTTP ${r.status}`).slice(0, 300) };
}

/**
 * 连通性测试
 */
async function testConnection() {
  try {
    const gw = ensureConfigured();
    // 先探测网关进程是否存活
    const gwHost = new URL(gw.url).hostname;
    const gwPort = new URL(gw.url).port || 80;
    const gwAlive = await tcpProbe(gwHost, gwPort);
    if (!gwAlive) {
      return {
        ok: false,
        message: `无法连接 NetSDK 网关 ${gwHost}:${gwPort}。请先启动网关：java -jar gateway\\dh-netsdk-http.jar`
      };
    }
    // 探测设备 NetSDK 端口
    const devAlive = await tcpProbe(gw.device.host, gw.devicePort);
    if (!devAlive) {
      return {
        ok: false,
        message: `无法连接到门禁机 ${gw.device.host}:${gw.devicePort}（TCP 超时）。请检查设备网线是否接入、设备是否通电、IP 是否正确；若链路正常但 ping 不通，可尝试给设备断电重启`
      };
    }
    const r = await gatewayCall(gw, 'GET', '/gate/ping');
    const result = toResult(r, '连接成功');
    if (result.ok) {
      result.message = `连接成功（NetSDK 登录设备正常）`;
    } else {
      result.message = `设备登录失败: ${result.message}（请核对 config.json 中 device.username/password）`;
    }
    return result;
  } catch (e) {
    const m = e.message || String(e);
    const hint = /fetch failed|ETIMEDOUT|ECONNREFUSED|ECONNRESET|abort/i.test(m)
      ? '（网络层失败：请确认网关已启动、设备与服务器网络可达）'
      : '';
    return { ok: false, message: m + hint };
  }
}

/**
 * 添加访客用户 + 下发人脸
 * @param {string} userId 设备用户ID（如 V1730000000000）
 * @param {string} name 姓名
 * @param {Buffer} imageBuffer JPEG 照片（≤100KB）
 */
async function addFaceUser(userId, name, imageBuffer) {
  const gw = ensureConfigured();
  const r = await gatewayCall(gw, 'POST', '/gate/addUserFace', {
    userId,
    name,
    imageBase64: imageBuffer.toString('base64')
  }, 60000);
  return toResult(r, '人脸权限下发成功');
}

/**
 * 删除访客用户（同时清除设备上的人脸凭证）
 */
async function removeFaceUser(userId) {
  const gw = ensureConfigured();
  const r = await gatewayCall(gw, 'POST', '/gate/deleteUserFace', { userId }, 30000);
  return toResult(r, '设备人脸权限已回收');
}

module.exports = { testConnection, addFaceUser, removeFaceUser };
