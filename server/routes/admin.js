const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { db } = require('../db');
const dahua = require('../dahuaService');
const { loadConfig } = require('../utils/configLoader');
const { clearPhotos, photoCount } = require('../utils/photoCleaner');
const { getLanIps, getPrimaryLanIp } = require('../utils/cert');

const router = express.Router();

// ---------- 简单 token 认证 ----------
const tokens = new Map(); // token -> expiresAt
const TOKEN_TTL = 12 * 3600 * 1000;

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = tokens.get(token);
  if (!token || !exp || Date.now() > exp) {
    return res.status(401).json({ ok: false, message: '未登录或登录已过期' });
  }
  next();
}

router.post('/login', (req, res) => {
  const cfg = loadConfig();
  const { password } = req.body || {};
  if (password !== cfg.admin.password) {
    return res.json({ ok: false, message: '管理员密码错误' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL);
  return res.json({ ok: true, token });
});

// ---------- 统计 ----------
router.get('/stats', auth, (req, res) => {
  const today = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  const weekStart = new Date(today);
  const day = today.getDay() === 0 ? 7 : today.getDay();
  weekStart.setDate(today.getDate() - day + 1);
  const weekStr = `${weekStart.getFullYear()}-${p(weekStart.getMonth() + 1)}-${p(weekStart.getDate())}`;

  const todayCount = db.prepare("SELECT COUNT(*) c FROM visitors WHERE created_at >= ?").get(todayStr).c;
  const weekCount = db.prepare("SELECT COUNT(*) c FROM visitors WHERE created_at >= ?").get(weekStr).c;
  const activeCount = db.prepare(
    "SELECT COUNT(*) c FROM visitors WHERE status='active' AND device_removed=0 AND expire_at > datetime('now','localtime')"
  ).get().c;
  const totalCount = db.prepare('SELECT COUNT(*) c FROM visitors').get().c;

  const cfg = loadConfig();
  res.json({
    ok: true,
    todayCount,
    weekCount,
    activeCount,
    totalCount,
    photosCount: photoCount(),
    deviceConfigured: Boolean(cfg.device && cfg.device.host)
  });
});

// ---------- 访客报告 ----------
router.get('/report', auth, async (req, res) => {
  const { start, end, q, format } = req.query;
  const where = [];
  const params = [];
  if (start) { where.push('created_at >= ?'); params.push(`${start} 00:00:00`); }
  if (end) { where.push('created_at <= ?'); params.push(`${end} 23:59:59`); }
  if (q) { where.push('(name LIKE ? OR phone LIKE ? OR purpose LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT id, name, phone, purpose, status, granted_at, expire_at, device_user_id, device_removed, face_removed, created_at
    FROM visitors ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 1000`;
  const rows = db.prepare(sql).all(...params);

  // 从门禁机拉取开门记录，按 device_user_id 匹配出每位访客的刷脸时间（网关不可达时降级为空）
  const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  const now = new Date();
  // 设备时钟可能不准，查询窗口前后各放宽 2 天；匹配以用户ID为准，不影响结果正确性
  const baseStart = start ? new Date(`${start} 00:00:00`).getTime() : now.getTime() - 30 * 86400 * 1000;
  const baseEnd = end ? new Date(`${end} 23:59:59`).getTime() : now.getTime();
  const recStart = fmtLocal(new Date(baseStart - 2 * 86400 * 1000));
  const recEnd = fmtLocal(new Date(baseEnd + 2 * 86400 * 1000));
  const records = await dahua.getOpenDoorRecords(recStart, recEnd, 500);
  const scanMap = new Map();
  for (const r of records) {
    if (!r.userId) continue;
    const m = scanMap.get(r.userId) || { firstScanAt: r.eventTime, lastScanAt: r.eventTime, scanCount: 0 };
    if (r.eventTime < m.firstScanAt) m.firstScanAt = r.eventTime;
    if (r.eventTime > m.lastScanAt) m.lastScanAt = r.eventTime;
    m.scanCount += 1;
    scanMap.set(r.userId, m);
  }
  for (const row of rows) {
    const s = scanMap.get(row.device_user_id || '');
    row.firstScanAt = s ? s.firstScanAt : '';
    row.lastScanAt = s ? s.lastScanAt : '';
    row.scanCount = s ? s.scanCount : 0;
  }

  if (format === 'csv') {
    const statusMap = { active: '权限有效', expired: '已到期', failed: '下发失败' };
    const header = 'ID,姓名,手机号,来访目的,状态,首次刷脸时间,最近刷脸时间,授权时间,到期时间,设备权限已回收,照片已清理,登记时间';
    const lines = rows.map((r) => [
      r.id, r.name, r.phone, r.purpose,
      statusMap[r.status] || r.status,
      r.firstScanAt || '', r.lastScanAt || '',
      r.granted_at || '', r.expire_at || '',
      r.device_removed ? '是' : '否',
      r.face_removed ? '是' : '否',
      r.created_at
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [header, ...lines].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visitors_${Date.now()}.csv"`);
    return res.send(csv);
  }
  res.json({ ok: true, rows });
});

// ---------- 清理照片（只删照片，保留记录） ----------
router.post('/photos/clear', auth, (req, res) => {
  try {
    const count = clearPhotos();
    res.json({ ok: true, message: `已清理 ${count} 张访客照片，访客记录已保留` });
  } catch (e) {
    console.error('[photos/clear]', e);
    res.status(500).json({ ok: false, message: '清理失败：' + e.message });
  }
});

// ---------- 访客登记二维码 ----------
async function getVisitUrl() {
  const cfg = loadConfig();
  // 优先用配置的 serverIp；否则自动探测真正上网的网卡（WiFi/热点），
  // 规避直连门禁机的有线网卡；最后兜底取第一个局域网 IP
  let ip = cfg.server.serverIp;
  if (!ip) ip = await getPrimaryLanIp();
  if (!ip) ip = getLanIps()[0] || 'localhost';
  return `https://${ip}:${cfg.server.port}${cfg.server.visitPath}`;
}

router.get('/qrcode', auth, async (req, res) => {
  try {
    const url = await getVisitUrl();
    const buf = await QRCode.toBuffer(url, { width: 480, margin: 2 });
    res.type('png').send(buf);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/qrcode/url', auth, async (req, res) => {
  res.json({ ok: true, url: await getVisitUrl() });
});

// ---------- 设备连通性测试 ----------
router.get('/device/test', auth, async (req, res) => {
  const result = await dahua.testConnection();
  res.json(result);
});

module.exports = router;
