const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const dahua = require('../dahuaService');
const { loadConfig } = require('../utils/configLoader');

const router = express.Router();
const PHOTOS_DIR = path.join(__dirname, '..', 'photos');

function nowStr(offsetHours = 0) {
  const d = new Date(Date.now() + offsetHours * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 访客登记
router.post('/register', async (req, res) => {
  try {
    const { name, phone, purpose, photo } = req.body || {};
    if (!name || !String(name).trim() || String(name).trim().length > 20) {
      return res.json({ ok: false, message: '请填写真实姓名（20字以内）' });
    }
    if (!/^1[3-9]\d{9}$/.test(String(phone || '').trim())) {
      return res.json({ ok: false, message: '请填写正确的11位手机号' });
    }
    if (!purpose || !String(purpose).trim() || String(purpose).trim().length > 50) {
      return res.json({ ok: false, message: '请选择或填写来访目的' });
    }
    const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(String(photo || ''));
    if (!m) {
      return res.json({ ok: false, message: '请拍摄人脸照片' });
    }
    const imgBuf = Buffer.from(m[2], 'base64');
    if (imgBuf.length < 5 * 1024) {
      return res.json({ ok: false, message: '照片过小，请重新拍摄' });
    }
    if (imgBuf.length > 2 * 1024 * 1024) {
      return res.json({ ok: false, message: '照片过大，请重新拍摄' });
    }

    const cfg = loadConfig();
    const deviceUserId = 'V' + Date.now();
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    const photoFile = path.join(PHOTOS_DIR, `${deviceUserId}.jpg`);
    fs.writeFileSync(photoFile, imgBuf);

    const grantedAt = nowStr();
    const expireAt = nowStr(cfg.policy.permissionHours);

    let result;
    try {
      result = await dahua.addFaceUser(deviceUserId, String(name).trim(), imgBuf);
    } catch (e) {
      result = { ok: false, message: e.message || String(e) };
    }

    if (result.ok) {
      db.prepare(`INSERT INTO visitors
        (name, phone, purpose, photo_path, device_user_id, granted_at, expire_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`)
        .run(String(name).trim(), String(phone).trim(), String(purpose).trim(),
          `${deviceUserId}.jpg`, deviceUserId, grantedAt, expireAt);
      return res.json({
        ok: true,
        message: `登记成功！人脸权限已开通，有效期 ${cfg.policy.permissionHours} 小时`
      });
    }

    db.prepare(`INSERT INTO visitors
      (name, phone, purpose, photo_path, device_user_id, granted_at, expire_at, status, fail_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?)`)
      .run(String(name).trim(), String(phone).trim(), String(purpose).trim(),
        `${deviceUserId}.jpg`, deviceUserId, grantedAt, expireAt, result.message);
    return res.json({ ok: false, message: '登记失败：' + result.message });
  } catch (e) {
    console.error('[visitor/register]', e);
    return res.status(500).json({ ok: false, message: '服务器内部错误' });
  }
});

module.exports = router;
