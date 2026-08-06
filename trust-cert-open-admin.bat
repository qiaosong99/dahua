@echo off
chcp 65001 >nul
title 信任证书并打开管理端
cd /d %~dp0

echo ============================================
echo  将系统自签名证书导入"受信任的根证书颁发机构"
echo  弹出安全警告时请点击【是】
echo ============================================
certutil -addstore Root "%~dp0server\certs\cert.pem"

echo.
echo 正在打开管理端...
start "" "https://localhost:8443/#/admin"
echo 若浏览器仍提示不安全，点击"高级 - 继续访问"即可（导入证书后通常不再提示）
pause
