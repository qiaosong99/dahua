# 交接文档：大华门禁机对接（NetSDK 网关方案）

> 本文档用于在另一台电脑上继续本项目的实施工作。请按"待办任务"顺序执行。

## 一、项目背景

- 项目：访客门禁管理系统（本仓库 `d:\dahua`）
  - 访客扫码 H5 登记（姓名/手机号/目的 + 前置摄像头拍照）→ 后端自动下发人脸到大华门禁机 → 访客 24 小时刷脸开门 → 到期自动回收权限
  - 技术栈：Node.js (Express + better-sqlite3) 后端 + Vue3/Vite 前端（构建产物输出到 server/public）
- 目标设备：大华人脸门禁一体机 **DH-ASI7213X-T**
  - 设备 IP：`192.168.1.108`（静态，DHCP 已关）
  - 账号：`admin` / 密码：`admin123`
  - 序列号：7H05F91PAJ0D0A6，MAC：B4:4C:3B:3A:38:24
  - 硬件：HI3516DV300，固件 ASI7213X-T-V1

## 二、当前进展与关键结论（重要！先读）

### 已验证的设备能力（真机实测）
| 接口 | 状态 |
| --- | --- |
| ICMP ping | 正常（设备重启后稳定） |
| HTTP 80（Web/CGI） | 开放，`/cgi-bin/magicBox.cgi?action=getSystemInfo` + Digest 认证登录成功 |
| HTTPS 443 | 关闭 |
| **HTTP `/RPC2`** | **被固件关闭**（连接直接断开，HTTP 和 HTTPS 均无响应） |
| **TCP 37777（NetSDK）** | **开放** |

### 核心结论
原代码 `server/dahuaService.js` 依赖 `/RPC2`（global.login / userManager.addUserInfo），**在本设备固件上不可用**。
已确定改走 **大华 NetSDK 网关方案**：参考开源项目 [handsomestWei/dh-netsdk-http](https://github.com/handsomestWei/dh-netsdk-http)（Java/Spring Boot，把大华 NetSDK DLL 封装为本地 HTTP 服务），扩展其人脸接口后，Node.js 后端改为调用该网关。

### 网络拓扑（另一台电脑需复现）
- 电脑有线网卡（直连门禁机网线）配置静态 IP：`192.168.1.100/24`（无网关）
- 电脑同时通过 WiFi 上网（手机热点或办公网），访客手机访问 `https://电脑WiFi的IP:8443`
- 门禁机网线可插电脑网口/扩展坞网口直连，**无需路由器**
- 经验教训：
  - 设备网络协议栈偶发卡死（ping 全丢但链路 Up），**断电重启即恢复**
  - ARP 表出现陈旧静态条目会导致假性不通，`arp -d 192.168.1.108` 后重 ping 即可
  - USB 扩展坞网卡不稳定，建议用电脑自带网口；已禁用 USB 选择性挂起

### 本机环境（云电脑现状）
- Node.js v24.18.0，`server/` 和 `web/` 依赖已装好
  - 注意：`better-sqlite3` 已从 11.x 升级到 **13.0.3**（11.x 无 Node24 预编译二进制），`package.json/lock` 已更新
  - 新增依赖 `undici`（用于自签名证书跳过，NetSDK 方案落地后此改动可能不再需要）
  - `server/dahuaService.js` 有临时改动（undici dispatcher），**将被第 4 步整体重写，不必保留**
- Java：OpenJDK 21（Temurin 21.0.12）
- Maven：**未安装**（待办第 1 步）
- `server/config.json` 已创建（在 .gitignore 中不入库），内容：device.host=192.168.1.108, port=80, username=admin, password=admin123, admin 密码 admin123
- 参考项目已克隆于 `d:\dh-netsdk-http2`（未入库，另一台电脑需重新 clone）

## 三、参考项目说明（dh-netsdk-http）

- 仓库：https://github.com/handsomestWei/dh-netsdk-http
- 作用：独立进程 HTTP 网关（端口 8090，前缀 `/dh-netsdk`），内部调大华 NetSDK DLL（`libs/win64/`，DLL 需与 jar 同目录）
- 已有接口：门禁用户增删改查、卡管理、开门/关门、开门记录（见其 README）
- 安全协议（每个请求必带 Header）：
  - `Dh-Device-Ip` / `Dh-Device-User`(默认admin) / `Dh-Device-Port`(默认37777)
  - `Dh-Device-Timestamp`：微秒时间戳
  - `Dh-Device-Password`：AES-128-ECB/PKCS5 加密 `密码|时间戳` 后 Base64，密钥 `NetSDK1234567890`（见 `application.yml` 的 `crypto.aes-key`）
- 关键源码位置：
  - `src/main/java/com/netsdk/demo/http/controller/BaseDeviceController.java`：请求前自动登录设备，请求后释放句柄（ThreadLocal）
  - `src/main/java/com/netsdk/demo/http/util/DeviceAccessHttpUtil.java`：Header 校验与 AES 加解密
  - `src/main/java/com/netsdk/demo/module/ext/GateExtModule.java`：带 loginHandle 参数的门禁操作（addOrUpdateUser / deleteUser 等）
  - `src/main/java/com/netsdk/demo/module/GateModule.java`：有现成的 `addFaceInfo/modifyFaceInfo/deleteFaceInfo/clearFaceInfo`（CLIENT_FaceInfoOpreate），但用的是全局静态句柄且未暴露 HTTP——需要改造成带 handle 参数并暴露
- 构建：`mvn clean package -Phttp -DskipTests` 生成 `target/dh-netsdk-http.jar`（JDK target 1.8，若 Java21 编译失败可装 OpenJDK 17）
- 启动：jar 与 `libs/win64/*.dll` 同目录，`java -jar dh-netsdk-http.jar`

## 四、待办任务（按顺序执行）

### 任务 1：安装 Maven
1. 下载 https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip（国内可试 https://mirrors.aliyun.com/apache/maven/ 或清华镜像）
2. 解压到 `d:\apache-maven`
3. 在其 `conf/settings.xml` 的 `<mirrors>` 中加阿里云镜像：
   ```xml
   <mirror>
     <id>aliyun</id>
     <mirrorOf>central</mirrorOf>
     <url>https://maven.aliyun.com/repository/public</url>
   </mirror>
   ```
4. 验证 `mvn -version`

### 任务 2：修改网关源码（先 clone 仓库到本地）
仓库目录以下记为 `GW`（如 `d:\dh-netsdk-http2`）：

1. **修复时间戳校验**（否则 Node.js 无法通过校验）：
   `GW/src/main/java/com/netsdk/demo/http/util/DeviceAccessHttpUtil.java` 中
   `long now = System.nanoTime();` 改为 `long now = System.currentTimeMillis() * 1000L;`
   （客户端统一发送 epoch 微秒：`Date.now()*1000`）
2. **GateExtModule 新增人脸方法**（参照 GateModule.java 第 322~440 行，但改用传入的 loginHandle 参数）：
   - `addFaceInfo(LLong loginHandle, String userId, Memory imageMem)`：CLIENT_FaceInfoOpreate + EM_FACEINFO_OPREATE_ADD
   - `deleteFaceInfo(LLong loginHandle, String userId)`：EM_FACEINFO_OPREATE_REMOVE
   - 注意图片 ≤100KB JPEG（设备要求）
3. **新增 HTTP 接口**（GateController.java 或新建 FaceController，继承 BaseDeviceController）：
   - `POST /gate/addUserFace`：入参 `{userId, name, imageBase64}`；先 addOrUpdateUser（UserType=General，门禁权限），再 addFaceInfo；人脸失败时回滚删除用户
   - `POST /gate/deleteUserFace`：入参 `{userId}`；先 deleteFaceInfo 再 deleteUser
   - `GET /gate/ping`：返回设备信息（可用 getDeviceConfig 或简单返回登录成功），供连通性测试
4. 新增对应 Request DTO（参照 dto/gate/ 下现有类的 Lombok 写法）

### 任务 3：打包并部署网关
1. `mvn clean package -Phttp -DskipTests`
2. 建运行目录如 `d:\dh-gateway\`，复制 `target/dh-netsdk-http.jar` 和 `GW/libs/win64/` 下所有 DLL 进去
3. 启动：`java -jar dh-netsdk-http.jar`，确认 `http://localhost:8090/dh-netsdk/swagger-ui.html` 可访问
4. 若 DLL 加载失败：安装 Visual C++ Redistributable（x64）

### 任务 4：改写 Node.js 后端（本仓库）
1. **重写 `server/dahuaService.js`**（保持导出签名 `{ testConnection, addFaceUser, removeFaceUser }` 不变，routes 层无需改）：
   - 删除全部 RPC2/Digest/undici 逻辑
   - 封装网关请求：每次请求生成微秒时间戳 `ts = String(Date.now()*1000)`，AES-128-ECB 加密 `device.password + '|' + ts`（密钥取 config `gateway.aesKey`），Base64 后放 Header
   - `testConnection()` → GET `/gate/ping`，失败时给出诊断信息（先 TCP 探测网关 8090 和设备 37777）
   - `addFaceUser(userId, name, imageBuffer)` → POST `/gate/addUserFace`（imageBase64）
   - `removeFaceUser(userId)` → POST `/gate/deleteUserFace`
   - 响应结构 `{success, message}` → 映射为 `{ok, message}`
2. **`server/config.json`** 增加段（config.example.json 同步更新）：
   ```json
   "gateway": { "url": "http://127.0.0.1:8090/dh-netsdk", "aesKey": "NetSDK1234567890" }
   ```
3. **`start.bat`** 增加网关启动：先 `start javaw -jar d:\dh-gateway\dh-netsdk-http.jar`，等待 8090 就绪后再起 Node 服务（路径按实际部署调整）

### 任务 5：真机联调（需要门禁机在场）
1. 接好网线（电脑网口 ↔ 门禁机），确认电脑有线网卡 IP 为 `192.168.1.100/24`，`ping 192.168.1.108` 通
2. 启动网关，用 Node 或 curl 带加密头调 `/gate/ping`，确认 NetSDK 登录成功
3. 启动后端（`start.bat` 或 `npm start`），管理端 `https://本机WiFi_IP:8443/#/admin`（密码 admin123）执行"门禁机连通性测试"
4. 用真人照片（≤100KB JPEG）走访客登记流程，设备屏幕确认人脸下发成功、能刷脸；随后在管理端清理测试数据
5. 若人脸下发报质量错误：换正面、光照均匀的真人照片（设备有人脸质量校验，合成图/翻拍可能被拒）

## 五、故障速查

| 现象 | 处理 |
| --- | --- |
| ping 设备全丢但链路 Up | 设备协议栈卡死：断电 10 秒重启；或 `arp -d 192.168.1.108` 清陈旧 ARP |
| 网关报时间戳过期 | 确认已按任务 2.1 改为 epoch 微秒，客户端发 `Date.now()*1000` |
| 网关报"请求重放" | 每次请求必须用新的时间戳重新加密 |
| DLL UnsatisfiedLinkError | DLL 未与 jar 同目录，或缺 VC++ 运行库 |
| better-sqlite3 安装失败 | Node 24 需 better-sqlite3@13.x；安装用 `--registry=https://registry.npmmirror.com` |

## 六、仓库文件说明

- `server/`：后端（config.json 不入库，参照 config.example.json + 本文档第二节重建）
- `web/`：前端源码
- `HANDOVER.md`：本文档
