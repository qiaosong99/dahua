/**
 * 访客门禁管理系统 - 服务入口
 * HTTPS 主服务（手机浏览器调用摄像头必须 HTTPS）+ HTTP 重定向服务
 */
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');

const { loadConfig } = require('./utils/configLoader');
const { ensureCert, getLanIps } = require('./utils/cert');
const visitorRouter = require('./routes/visitor');
const adminRouter = require('./routes/admin');
const scheduler = require('./jobs/scheduler');

const cfg = loadConfig();
const app = express();

app.use(express.json({ limit: '15mb' }));

// API 路由
app.use('/api/visitor', visitorRouter);
app.use('/api/admin', adminRouter);

// 前端静态文件（web 构建产物）
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) res.status(404).send('前端尚未构建，请先执行 web 目录的 npm run build');
  });
});

// HTTPS 服务
const { key, cert } = ensureCert(cfg.server.serverIp);
https.createServer({ key, cert }, app).listen(cfg.server.port, '0.0.0.0', () => {
  const ips = cfg.server.serverIp ? [cfg.server.serverIp] : getLanIps();
  console.log('==============================================');
  console.log(' 访客门禁管理系统已启动');
  console.log('----------------------------------------------');
  for (const ip of ips) {
    console.log(`  访客登记页: https://${ip}:${cfg.server.port}/#/visit`);
    console.log(`  管理端:     https://${ip}:${cfg.server.port}/#/admin`);
  }
  console.log('----------------------------------------------');
  if (!cfg.device.host) {
    console.log(' 提示: 尚未配置门禁机，请在 server/config.json 填写 device.host 等参数');
  }
  console.log('==============================================');
});

// HTTP 服务（重定向到 HTTPS）
const redirectApp = express();
redirectApp.use((req, res) => {
  const ip = cfg.server.serverIp || req.hostname;
  res.redirect(301, `https://${ip}:${cfg.server.port}${req.originalUrl}`);
});
http.createServer(redirectApp).listen(cfg.server.httpPort, '0.0.0.0');

// 启动定时任务
scheduler.start();

process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
});
