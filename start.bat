@echo off
chcp 65001 >nul
cd /d %~dp0
set PATH=%~dp0runtime\node;%PATH%
echo 正在启动访客门禁管理系统...
node server\index.js
pause
