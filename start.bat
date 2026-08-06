@echo off
chcp 65001 >nul
cd /d %~dp0
set PATH=%~dp0runtime\node;%PATH%
echo 正在启动 NetSDK 网关...
start "dh-netsdk-gateway" /min javaw -jar "%~dp0gateway\dh-netsdk-http.jar"
REM FRP 内网穿透：frpc.toml 配置了 serverAddr 时自动拉起
if exist "%~dp0frp\frpc.toml" powershell -NoProfile -Command "$c=Get-Content -Raw '%~dp0frp\frpc.toml'; if($c -match 'serverAddr\s*=\s*\"[^\"]+') { Start-Process -WindowStyle Minimized '%~dp0frp\frpc.exe' -ArgumentList '-c','%~dp0frp\frpc.toml'; Write-Host 'FRP 内网穿透已启动' } else { Write-Host 'FRP 未配置（frpc.toml 的 serverAddr 为空），跳过' }"
timeout /t 10 /nobreak >nul
echo 正在启动访客门禁管理系统...
node server\index.js
pause
