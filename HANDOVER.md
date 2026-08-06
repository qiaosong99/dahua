# 访客门禁管理系统 — 项目交接情况说明（2026-08-06）

> 本文档面向接手本项目的 AI 或开发者，描述当前真实状态、环境细节与剩余工作。所有结论均经实测验证。

## 一、项目是什么

访客门禁管理系统：访客扫码进入 H5 页面登记（姓名/手机号/来访目的 + 前置摄像头拍照），后端自动将人脸下发到大华门禁机 **DH-ASI7213X-T**，访客 24 小时内刷脸开门，到期自动回收权限，每周一凌晨自动清理照片（保留记录）。

### 架构（当前最终形态）

```
访客手机 H5 ──HTTPS:8443──> Node.js 后端(Express+SQLite)
管理端浏览器 ─┘                    │ HTTP:8090（AES 加密头）
                          dh-netsdk-http 网关(Java/Spring Boot)
                                    │ NetSDK TCP:37777
                            大华门禁机 192.168.1.108
（可选）frpc ──FRP穿透──> 公网 frps 服务器（外网扫码，待用户提供服务端信息）
```

**关键背景**：该设备固件关闭了 HTTP `/RPC2` 接口（POST 直接断开连接，HTTP/HTTPS 均验证过），因此放弃 HTTP 协议对接，改用大华官方 NetSDK（TCP 37777），通过开源项目 [handsomestWei/dh-netsdk-http](https://github.com/handsomestWei/dh-netsdk-http) 封装的 Java 网关桥接。网关源码已并入本仓库 `dh-netsdk-http/` 并做了定制修改（见第六节）。

## 二、功能完成与验证状态

| 功能 | 状态 | 验证证据 |
| --- | --- | --- |
| NetSDK 网关对接（登录/连通性测试） | ✅ 完成 | 管理端页面实测"连接成功" |
| 人脸下发（建用户+传照片，失败自动回滚） | ✅ 完成 | 真机多次实测通过 |
| 权限回收（删人脸+删用户） | ✅ 完成 | 真机实测通过 |
| 24h 到期自动回收 / 每周清理照片 | ✅ 原有功能 | 调度器随服务启动 |
| 访客记录显示刷脸时间（首次/最近/授权/到期） | ✅ 完成 | 真实数据匹配成功（来自设备开门记录） |
| 访客二维码自动指向当前上网网卡 IP + 刷新按钮 | ✅ 完成 | 浏览器实测（UDP 出网探测法） |
| 访客页取景器简化（无椭圆框、全帧预览与拍摄） | ✅ 完成 | 浏览器 DOM 实测；手机体验待确认 |
| 中文姓名乱码修复（GBK 编码下发） | ✅ 完成 | 设备读回验证：新用户"编码验证"中文正常 |
| 设备时间自动校准（连通性测试/人脸下发时同步） | ✅ 完成 | 实测生效（设备原时钟慢 1.5 天） |
| 人脸下发失败友好提示（SDK 1030 等错误透传） | ✅ 完成 | 重放失败照片实测提示正确 |
| FRP 内网穿透 | 🔶 客户端就绪 | frpc 0.70.1 + 模板 + start.bat 集成；待 frps 服务端信息 |
| 手机扫码全流程（真机体验） | ⏳ 待验收 | 需用户现场 |
| 设备屏幕确认中文姓名显示 | ⏳ 待验收 | 需用户现场看设备 |

## 三、环境信息（重要）

### 网络拓扑
- **电脑 ↔ 门禁机**：网线直连（电脑自带 Realtek 网口，勿用 USB 扩展坞网卡——不稳定）。电脑有线网卡静态 IP `192.168.1.100/24`（无网关）
- **电脑 ↔ 互联网**：WiFi（当前为手机热点 `10.51.49.x`，网关 `10.51.49.60`，电脑 IP `10.51.49.118`，热点重启后可能变化，二维码会自动探测新 IP）
- **门禁机**：`192.168.1.108`（静态，DHCP 关），账号 `admin` / 密码 `admin123`

### 服务与端口
| 服务 | 端口 | 启动方式 |
| --- | --- | --- |
| NetSDK 网关（Java） | 8090 | `java -jar gateway\dh-netsdk-http.jar`（start.bat 自动） |
| Node.js 后端 + HTTPS 托管 | 8443 (HTTPS) / 8080 (HTTP 重定向) | `node server\index.js`（start.bat 自动） |
| frpc（可选） | - | 配置 `frp\frpc.toml` 后 start.bat 自动拉起 |
| vite dev server（仅调试） | 5173 | `npm run dev --prefix web`（已带 API 代理，HTTP 访问可绕过证书问题做 UI 验证） |

### 访问地址
- 访客登记：`https://<当前WiFi IP>:8443/#/visit`
- 管理端：`https://<当前WiFi IP>:8443/#/admin`（密码 `admin123`，在 `server/config.json` 的 `admin.password`）

### 本机已装环境
Node.js v24.18.0、OpenJDK 21（Temurin）、Maven 3.9.9（`d:\apache-maven`）。better-sqlite3 已升级到 13.0.3（Node 24 兼容）。

## 四、目录结构

```
d:\dahua\
├── server/                 Node.js 后端
│   ├── index.js            入口（HTTPS+HTTP 重定向+静态托管）
│   ├── dahuaService.js     网关调用封装（AES 加密头、testConnection/addFaceUser/removeFaceUser/getOpenDoorRecords）
│   ├── routes/             admin.js（含 /report 刷脸时间聚合）、visitor.js
│   ├── config.json         运行配置（不入库，含 device/gateway/admin 凭据）
│   ├── db.js               SQLite（visitors 表）
│   └── photos/             访客照片
├── web/                    Vue3+Vite 前端（构建输出到 server/public）
├── dh-netsdk-http/         网关源码（已定制，mvn clean package -Phttp 构建）
├── gateway/                网关运行包（jar+11个DLL，不入库）
├── frp/                    frpc.exe(v0.70.1) + frpc.toml 模板
├── start.bat               一键启动（网关→可选FRP→Node）
├── trust-cert-open-admin.bat  一键信任自签名证书并打开管理端（需管理员运行）
└── visitor-access-cert.cer    手机可安装的证书（不入库，可重新从 server/certs/cert.pem 导出）
```

## 五、关键配置

### server/config.json（参照 config.example.json）
- `device`：门禁机凭据（host/username/password）
- `gateway`：网关地址 `http://127.0.0.1:8090/dh-netsdk`、AES 密钥 `NetSDK1234567890`、设备 NetSDK 端口 37777
- `server.serverIp`：留空则二维码自动探测上网网卡 IP；FRP 穿透后改为公网地址

### frp/frpc.toml
填 `serverAddr/serverPort/auth.token` 后 start.bat 自动启动穿透；穿透后把 `server.serverIp` 改为公网地址并在管理端刷新二维码。

## 六、网关定制修改清单（dh-netsdk-http/ 相对上游的改动）

1. `DeviceAccessHttpUtil.java`：时间戳校验改为 **epoch 微秒**（原版 System.nanoTime 外部客户端无法生成）
2. `GateExtModule.java`：新增 `addFaceInfo`（带姓名，**GBK 编码**写入，失败记录 SDK 错误）、`deleteFaceInfo`、`syncDeviceTime`、`lastFaceError`
3. `GateController.java`：新增 `GET /gate/ping`（连通性+自动校时）、`POST /gate/addUserFace`（建用户+下发人脸+校时+失败回滚+错误透传）、`POST /gate/deleteUserFace`、`POST /gate/syncTime`
4. `dto/gate/AddUserFaceRequest.java`：新增 DTO
5. 修改后重新打包方法：`d:\apache-maven\bin\mvn.cmd -f d:\dahua\dh-netsdk-http\pom.xml clean package -Phttp -DskipTests`，产物复制到 `gateway/` 后重启网关

### 网关请求协议（Node 已实现，供参考）
每次请求必带 Header：`Dh-Device-Ip / Dh-Device-User / Dh-Device-Password（AES-128-ECB/PKCS5 加密"密码|epoch微秒时间戳"后 Base64）/ Dh-Device-Timestamp / Dh-Device-Port(37777)`。同一加密串只允许用一次（防重放），每次请求必须用新时间戳。

## 七、故障速查

| 现象 | 处理 |
| --- | --- |
| ping 设备全丢但链路 Up | 设备协议栈卡死：断电 10 秒重启；或 `arp -d 192.168.1.108` 清陈旧 ARP |
| 人脸下发失败"照片未检测到合格人脸"（SDK 1030） | 设备人脸质检未通过：正对镜头、光线充足、人脸占画面大部分、摘口罩/墨镜重拍 |
| 开门记录时间与真实时间不符 | 设备无时钟电池断电走时；连通性测试或新登记会自动校准，也可调 `/gate/syncTime` |
| 网关报时间戳过期/请求重放 | 客户端必须每次用新时间戳重新加密（epoch 微秒 `Date.now()*1000`） |
| DLL UnsatisfiedLinkError | DLL 必须与 jar 同目录（gateway/）；缺 VC++ 运行库则安装 VC Redistributable x64 |
| better-sqlite3 安装失败 | Node 24 需 better-sqlite3@13.x；加 `--registry=https://registry.npmmirror.com` |
| 浏览器提示证书不安全 | 电脑：管理员运行 trust-cert-open-admin.bat；手机：安装 visitor-access-cert.cer 并信任（iOS 需在"证书信任设置"开启完全信任）；调试可用 vite dev server（HTTP 5173） |
| 二维码扫码打不开 | 确认手机与服务器同一 WiFi/热点；管理端点"刷新二维码"；外网需求走 FRP |

## 八、剩余工作（按优先级）

1. **用户现场验收**（代码侧已全部完成）：
   - 设备屏幕"开门记录查询"确认中文名"编码验证"正常显示（该测试用户 24h 后自动回收）
   - 手机扫码完整登记一次，确认新取景器体验
2. **FRP 外网穿透**：等用户提供 frps 服务端 IP、端口、token → 填 `frp/frpc.toml` → 重启（start.bat 自动拉起）→ `server.serverIp` 改公网地址 → 管理端刷新二维码
3. 可选优化：访客登记高峰时开门记录分页拉取（当前单次最多 500 条）；frps 侧若有域名+受信证书可改 HTTPS 终结免证书警告

## 九、版本信息

- 仓库：https://github.com/qiaosong99/dahua（main 分支，最新 commit `0a8d887`）
- 设备上现存用户：任天奇（真实有效权限）、编码验证（GBK 测试用户，24h 自动回收）；旧的乱码测试用户已全部清理
- 管理端数据：visitors 表 3 条记录（含 1 条历史下发失败记录）
