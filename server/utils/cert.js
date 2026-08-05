/**
 * 自签名 HTTPS 证书生成（浏览器调用摄像头必须 HTTPS）
 */
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const os = require('os');

const CERT_DIR = path.join(__dirname, '..', 'certs');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');
const CRT_FILE = path.join(CERT_DIR, 'cert.pem');

function getLanIps() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function ensureCert(configuredIp) {
  if (fs.existsSync(KEY_FILE) && fs.existsSync(CRT_FILE)) {
    return { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CRT_FILE) };
  }
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [{ name: 'commonName', value: configuredIp || 'visitor-access' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const altNames = [{ type: 2, value: 'localhost' }];
  const ips = new Set(getLanIps());
  if (configuredIp) ips.add(configuredIp);
  for (const ip of ips) altNames.push({ type: 7, ip });

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'subjectAltName', altNames }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(CRT_FILE, forge.pki.certificateToPem(cert));
  return { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CRT_FILE) };
}

module.exports = { ensureCert, getLanIps };
