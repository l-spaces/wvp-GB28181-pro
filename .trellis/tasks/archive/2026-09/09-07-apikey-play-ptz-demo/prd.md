# 生成 ApiKey 播放云台控制示例

## Goal

在仓库 `demo` 目录提供一个可供第三方参考和联调的最小 Demo：使用 WVP 用户管理页面生成的 `ApiKey`，从运行时配置中选择多个设备及其通道，启动指定通道的视频播放，并提供指定通道的云台控制。Demo 只覆盖实时视频播放与云台控制。

## Background and confirmed repository facts

- 前端用户管理页面通过“管理ApiKey”展示和复制 ApiKey：`web/src/views/user/index.vue:52-58`、`web/src/views/user/apiKeyManager.vue:28-32`。
- ApiKey 在后端按 JWT 处理，第三方请求应使用 `api-key` 请求头：`src/main/java/com/genersoft/iot/vmp/conf/security/JwtAuthenticationFilter.java:63-83`。
- 实时点播接口为 `GET /api/play/start/{deviceId}/{channelId}`，返回 `StreamContent`：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:79-143`。
- 停止点播接口为 `GET /api/play/stop/{deviceId}/{channelId}`：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:145-166`。
- 云台控制接口为 `GET /api/front-end/ptz/{deviceId}/{channelId}`，支持方向和速度参数：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PtzController.java:74-144`。
- 水平/垂直速度范围是 `0-255`，变倍速度范围是 `0-15`：`PtzController.java:87-100`。
- WVP 返回的 `StreamContent` 可包含 `rtc`/`rtcs`、FLV、HLS、RTSP 等地址：`src/main/java/com/genersoft/iot/vmp/vmanager/bean/StreamContent.java:21-85`。
- 现有前端用 `ZLMRTCClient.Endpoint` 播放 WebRTC：`web/src/views/common/rtcPlayer.vue:31-77`；页面入口已加载 `web/public/static/js/ZLMRTCClient.js`：`web/public/index.html:10-12`。
- WVP API 的认证与媒体地址播放是两步；ApiKey 用于 WVP API，不应假设播放器连接媒体地址时会自动发送 `api-key`：`src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMHttpHookListener.java:78-95`、`src/main/java/com/genersoft/iot/vmp/service/impl/MediaServiceImpl.java:45-57`。

## Requirements

### R1. Vue/TypeScript 工程和运行时配置

- Demo 使用独立的 Vue 3 + TypeScript + Vite 工程，全部实现放在 `demo` 目录，不修改现有 `web` 工程。
- Demo 必须通过 `demo/public/config.json` 读取 WVP API 根地址、ApiKey、多个设备及其多个通道。
- 配置结构至少包含 `wvpBaseUrl`、`apiKey` 和 `devices[]`；每个设备至少包含 `deviceId`、展示名称和 `channels[]`，每个通道至少包含 `channelId` 和展示名称。
- `config.json` 使用占位示例值；真实 ApiKey、设备编号和通道编号不得写入 Vue/TypeScript 业务源码。
- 配置文件可以在部署后直接替换，不要求重新构建；启动时异步加载，并对文件缺失、JSON 格式错误、必填字段缺失和空设备/通道列表给出可见错误。
- 前端提供设备和通道选择；播放和云台操作始终使用当前选中的设备与通道。

### R2. ApiKey API 请求

- 所有 WVP API 请求必须携带 `api-key: <API_KEY>` 请求头。
- WVP API 根地址、路径参数和查询参数必须由统一的 API 模块构造，组件不重复拼接请求逻辑。
- HTTP 401/403、WVP 业务错误、网络错误和响应格式错误必须转换为页面可理解的错误提示。

### R3. 实时视频播放

- 页面提供单路“开始播放”和“停止播放”操作。
- 开始播放调用 `GET /api/play/start/{deviceId}/{channelId}`，从响应 `data` 中选择当前页面协议可用的 `rtcs`/`rtc` WebRTC 地址，并交给 `ZLMRTCClient.Endpoint` 播放。
- 播放器应正确关闭和释放 WebRTC 连接；媒体连接失败时页面显示错误。
- 停止播放必须关闭本地播放器，并调用 `GET /api/play/stop/{deviceId}/{channelId}`；即使停止 API 失败，也必须完成本地播放器清理并提示失败。
- 播放前必须存在有效配置、设备和通道；播放中切换设备/通道时不得遗留旧播放器或错误地停止新会话。

### R4. 云台控制

- 页面提供上、下、左、右、左上、右上、左下、右下、放大、缩小和停止按钮。
- 页面提供水平、垂直、变倍速度输入或选择，分别限制在 `0-255`、`0-255`、`0-15`。
- 云台请求调用 `GET /api/front-end/ptz/{deviceId}/{channelId}`，携带 `command`、`horizonSpeed`、`verticalSpeed` 和 `zoomSpeed` 查询参数以及 ApiKey 请求头。
- 云台操作结果和失败原因必须在页面上反馈；没有有效设备/通道或速度超范围时不发送请求。
- 云台按钮应防止同一操作的重复提交，并在请求期间明确忙碌状态。

### R5. 使用说明

- `demo` 目录包含中文使用说明，说明安装、开发、构建、部署后替换 `public/config.json`、ApiKey 请求方式、播放流程、云台参数和故障排查。
- 使用说明明确说明 ApiKey 会进入浏览器运行时，仅适合受控联调/演示环境；明确说明 WVP API 和媒体服务器地址/端口都必须可达，以及浏览器 WebRTC、CORS、HTTPS 的前提。
- 使用说明中的示例不使用真实 ApiKey、媒体 `secret` 或真实设备信息。

## Acceptance Criteria

- [ ] `demo` 目录存在可通过标准 npm 命令启动和构建的 Vue 3 + TypeScript + Vite 工程，且只包含实时视频播放和云台控制功能。
- [ ] 仅修改 `demo/public/config.json` 中的 WVP 地址、ApiKey、多个设备和多个通道后，无需修改业务源码即可在页面完成设备/通道选择。
- [ ] 点击开始播放时，网络请求为 `GET /api/play/start/{deviceId}/{channelId}` 且包含 `api-key` 请求头；成功响应中的 `rtc`/`rtcs` 地址被送入 WebRTC 播放器并显示播放状态。
- [ ] 点击停止播放时，播放器被关闭且发出 `GET /api/play/stop/{deviceId}/{channelId}`；停止接口失败时仍清理本地播放器并显示错误。
- [ ] 点击每个云台按钮时，网络请求为 `GET /api/front-end/ptz/{deviceId}/{channelId}`，使用当前设备/通道、正确命令和合法速度，并反馈结果。
- [ ] 配置错误、401/403、WVP 业务错误、网络错误和媒体播放错误均有可见提示；无效输入不会发起 WVP 请求。
- [ ] 使用说明包含安装、开发、构建、运行时配置替换、网络/浏览器前提和故障排查。
- [ ] 示例未实现录像回放、对讲、预置位、光圈、聚焦、巡航、扫描、雨刷、设备管理、登录页或服务端代理。

## Out of Scope

- 录像查询、录像回放、暂停/恢复/拖动/倍速、录像下载。
- 对讲、喊话、音频采集、截图、分享链接。
- 预置位、光圈、聚焦、巡航、扫描、雨刷、辅助开关和其他设备控制。
- 用户登录页、ApiKey 管理页、ApiKey 自动申请/刷新或服务端代理。
- WVP 后端 ApiKey 权限模型、过期时间问题或媒体层鉴权逻辑改造。
- 生产级用户权限、审计、限流和密钥托管系统。
- `demo/apikey-usage-guide.md` 是本任务之前用户单独要求生成的 ApiKey 链路分析文档，属于独立参考资料，不是本 Demo 的实现范围；本任务不删除、不修改、不依赖它。

## Technical Notes

- 采用部署后可替换的 `public/config.json`，启动时由 `fetch` 加载；这样配置替换不需要重新构建，但配置文件本身必须随静态资源一起部署。
- 采用原生 `fetch` 调用 WVP API，避免为最小 Demo 增加 Axios 等无必要依赖；API 响应在 API 模块边界统一解析为类型化结果。
- 播放器优先直接复用仓库中的 `ZLMRTCClient.js`，复制到 Demo 的 `public/vendor/` 并通过 `index.html` 加载；使用本地副本保证 Demo 不依赖运行中的 WVP 前端站点。
- ApiKey 会被浏览器查看到，Demo 不承担生产级密钥保护；后端代理明确不在本次范围内。
- 最终规划无阻塞问题，进入实现前需由用户单独确认规划摘要。