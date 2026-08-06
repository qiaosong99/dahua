# 交接文档：大华门禁机对接（NetSDK 网关方案）——已实施完成

> 对接方案已全部实施并真机验证通过。本文档说明当前状态、运行方式和后续注意事项。

## 一、项目背景

- 项目：访客门禁管理系统（本仓库 `d:\dahua`）
  - 访客扫码 H5 登记（姓名/手机号/目的 + 前置摄像头拍照）→ 后端自动下发人脸到大华门禁机 → 访客 24 小时刷脸开门 → 到期自动回收权限
  - 技术栈：Node.js (Express + better-sqlite3) 后端 + Vue3/Vite 前端（构建产物输出到 server/public）
- 目标设备：大华人脸门禁一体机 **DH-ASI7213X-T**
  - 设备 IP：`192.168.1.108`（静态，DHCP 已关）
  - 账号：`admin` / 密码：`admin123`
  - 序列号：7H05F91PAJ0D0A6，MAC：B4:4C:3B:3A:38:24

## 二、当前状态：对接已完成并真机验证

### 实测结论（2026-08-06）
| 项目 | 结果 |
| --- | --- |
| 设备 HTTP `/RPC2` | 被固件关闭（不可用，已放弃该路线） |
| 设备 NetSDK 37777 | 开放，登录正常 |
| 网关连通性测试 `/gate/ping` | 通过（"连接成功（NetSDK 登录设备正常）"） |
| 下发测试用户+人脸 `addFaceUser` | **成功**（"用户与人脸下发成功"） |
| 回收用户+人脸 `removeFaceUser` | **成功**（"用户及人脸删除成功"） |

### 架构
```
访客手机(H5) ──HTTPS:8443──> Node.js 后端 ──HTTP:8090──> dh-netsdk-http 网关(Java) ──NetSDK:37777──> 门禁机
```

## 三、目录结构（本仓库新增部分）

```
├── dh-netsdk-http/          NetSDK HTTP 网关源码（已修改，源自 github.com/handsomestWei/dh-netsdk-http）
│   ├── src/.../http/util/DeviceAccessHttpUtil.java    已改：时间戳校验改为 epoch 微秒
│   ├── src/.../module/ext/GateExtModule.java          已加：addFaceInfo / deleteFaceInfo
│   ├── src/.../http/controller/gate/GateController.java  已加：/gate/ping、/gate/addUserFace、/gate/deleteUserFace
│   ├── src/.../http/dto/gate/AddUserFaceRequest.java  新增 DTO
│   └── libs/win64/          大华 NetSDK DLL（构建/运行依赖）
├── gateway/                 网关运行包（jar+DLL，.gitignore 不入库，见下方重建方法）
├── server/dahuaService.js   已重写为网关版（AES 加密头 + epoch 微秒时间戳）
├── server/config.json       新增 gateway 配置段（文件不入库）
└── start.bat                已改：先启动网关再启动 Node 服务
```

## 四、在新电脑上部署运行

### 前置条件
- Node.js（建议 ≥22；Node 24 需用 better-sqlite3@13.x，本仓库 package.json 已更新）
- Java 21（Temurin 即可）
- npm 安装依赖：`server/` 和 `web/` 各执行一次 `npm install --registry=https://registry.npmmirror.com`
- 首次部署必须构建前端：`npm run build --prefix web`（产物输出到 server/public，不入库；不构建会提示“前端尚未构建”）

### 网关运行包（gateway/ 不入库，需重建）
1. 安装 Maven 3.9.x（https://archive.apache.org/dist/maven/maven-3/ 下载解压即可）
2. `mvn -f dh-netsdk-http\pom.xml clean package -Phttp -DskipTests`
3. 建 `gateway\` 目录，复制 `dh-netsdk-http\target\dh-netsdk-http.jar` 和 `dh-netsdk-http\libs\win64\*.dll` 进去
4. 若 DLL 加载失败：安装 Visual C++ Redistributable x64

### 配置文件（server/config.json，参照 config.example.json）
```json
{
  "server": { "port": 8443, "httpPort": 8080, "serverIp": "", "visitPath": "/#/visit" },
  "admin": { "password": "admin123" },
  "device": { "host": "192.168.1.108", "port": 80, "https": false, "username": "admin", "password": "admin123" },
  "gateway": { "url": "http://127.0.0.1:8090/dh-netsdk", "aesKey": "NetSDK1234567890", "devicePort": 37777 },
  "policy": { "permissionHours": 24, "weeklyCleanDay": 1, "weeklyCleanHour": 3 }
}
```

### 网络接线
- 电脑有线网卡直连门禁机网线，有线网卡设静态 IP `192.168.1.100/24`（无网关）
- 电脑 WiFi 正常上网；访客手机连同一热点/WiFi，访问 `https://电脑WiFi的IP:8443/#/visit`
- 管理端：`https://电脑WiFi的IP:8443/#/admin`
- 访客二维码会自动探测当前上网网卡 IP（UDP 出网探测，自动避开直连门禁机的 192.168.1.x）；热点 IP 变化后在管理端二维码页点“刷新二维码”即可，无需改配置

### 手机摄像头与证书
- 手机浏览器调用摄像头必须信任自签名证书（iOS 不信任则 getUserMedia 直接不可用）
- 导出证书：将 `server/certs/cert.pem` 转为 DER 格式 `.cer`（PowerShell X509Certificate2 导出）
- iPhone：传输安装描述文件 → 设置-通用-关于本机-证书信任设置 → 开启完全信任
- Android：安装 CA 证书或 Chrome 点过警告直接使用
- 访客页已内置“直接拍照/选择照片”降级入口，不依赖摄像头 API

### 启动
双击 `start.bat`（自动先起网关、若 frp/frpc.toml 已配置则起 FRP 穿透、等 10 秒、再起 Node 服务）。

### FRP 内网穿透（外网扫码）
- `frp/frpc.exe` 已内置（v0.70.1），配置文件 `frp/frpc.toml`
- 填写 `serverAddr/serverPort/auth.token`（你自己的 frps 服务端）后，start.bat 自动拉起 frpc，把本机 8443 穿透到公网 remotePort
- 穿透成功后把 `config.json` 的 `server.serverIp` 改为公网地址，管理端点“刷新二维码”即得公网二维码
- 访客手机首次访问需处理证书警告（iOS：显示详细信息→访问此网站；或安装 visitor-access-cert.cer 并信任）

### 设备中文姓名与时间同步
- 姓名以 GBK 编码下发（大华设备要求），乱码问题已修复
- 连通性测试与人脸下发时自动校准设备时间（设备无时钟电池，断电会走时，校准保证开门记录时间准确）
- 管理端访客记录含：首次刷脸/最近刷脸时间（来自设备开门记录，按用户ID匹配，查询窗口已对设备时钟偏差容错）、授权时间、到期时间

## 五、待用户最终确认
- [ ] 管理端"门禁机连通性测试"按钮验证
- [ ] 真人照片走完整访客登记流程，设备屏幕确认能刷脸开门（AI 生成照片已验证可下发，但设备人脸质量校验对真人照片更可靠）

## 六、故障速查

| 现象 | 处理 |
| --- | --- |
| ping 设备全丢但链路 Up | 设备协议栈卡死：断电 10 秒重启；或 `arp -d 192.168.1.108` 清陈旧 ARP |
| 网关报时间戳过期/校验失败 | 客户端必须发 epoch 微秒 `Date.now()*1000`，且每次请求重新加密 |
| 网关报"请求重放" | 每次请求必须用新的时间戳 |
| DLL UnsatisfiedLinkError | DLL 未与 jar 同目录，或缺 VC++ 运行库 |
| better-sqlite3 安装失败 | Node 24 需 better-sqlite3@13.x；安装加 `--registry=https://registry.npmmirror.com` |
| 人脸下发被拒（SDK 1030 照片特征值提取失败） | 设备人脸质检未通过：正对镜头、光线充足、人脸占画面大部分、摘口罩/墨镜重拍；网关已将友好提示透传到访客页 |

## 七、网关接口协议（Node 后端已实现，供参考）

请求头（每次请求都要，密码 AES-128-ECB/PKCS5 加密 `密码|epoch微秒时间戳` 后 Base64，密钥见 config `gateway.aesKey`）：
`Dh-Device-Ip` / `Dh-Device-User` / `Dh-Device-Password` / `Dh-Device-Timestamp` / `Dh-Device-Port`

| 接口 | 用途 |
| --- | --- |
| GET `/gate/ping` | 连通性测试（登录设备） |
| POST `/gate/addUserFace` `{userId,name,imageBase64}` | 建用户+下发人脸（失败自动回滚） |
| POST `/gate/deleteUserFace` `{userId}` | 删人脸+删用户 |
| Swagger 文档 | `http://localhost:8090/dh-netsdk/swagger-ui.html` |
