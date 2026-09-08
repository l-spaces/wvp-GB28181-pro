# 研究记录：独立 Demo 的 WVP 与播放器合同

## 研究目标

确认独立 Vue + TypeScript Demo 在不修改现有 `web` 工程的前提下，能否复用当前 WVP 的实时点播、云台控制和 WebRTC 播放链路。

## 仓库证据

1. ApiKey 请求头
   - `src/main/java/com/genersoft/iot/vmp/conf/security/JwtAuthenticationFilter.java:63-83` 在没有 `access-token` 时读取 `api-key`，因此第三方 API 模块应使用 `api-key` 请求头。
2. 实时点播
   - `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:79-143` 暴露 `GET /api/play/start/{deviceId}/{channelId}`，成功后返回 `WVPResult<StreamContent>`。
3. 停止点播
   - `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:145-166` 暴露 `GET /api/play/stop/{deviceId}/{channelId}`。
4. 云台控制
   - `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PtzController.java:74-144` 暴露 `GET /api/front-end/ptz/{deviceId}/{channelId}`；命令映射为方向/变倍/停止，速度校验见 `PtzController.java:87-100`。
5. WebRTC 地址
   - `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMMediaNodeServerService.java:663-680` 生成 FLV、HLS、RTSP、RTC 等地址。
   - `src/main/java/com/genersoft/iot/vmp/vmanager/bean/StreamContent.java:81-85` 对外提供 `rtc` 和 `rtcs` 字段。
6. 播放器复用
   - `web/src/views/common/rtcPlayer.vue:31-77` 使用 `new ZLMRTCClient.Endpoint`，配置 `zlmsdpUrl`、`recvOnly` 等参数，并监听远端流、ICE 和 Offer/Answer 事件。
   - `web/public/index.html:10-12` 直接加载 `ZLMRTCClient.js`，说明该播放器可以作为浏览器全局脚本使用，不要求 Vue 组件依赖。
7. API 与媒体认证边界
   - `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMHttpHookListener.java:78-95` 和 `src/main/java/com/genersoft/iot/vmp/service/impl/MediaServiceImpl.java:45-57` 表明媒体播放由 ZLM Hook/callId 另行处理，WVP 的 `api-key` 不应拼接或假定自动传递给媒体 URL。

## 设计决策

- 使用 `public/config.json` 运行时加载，满足部署后替换 ApiKey 和多设备/多通道列表的要求。
- 使用原生 `fetch`，把 ApiKey 和 WVP 响应解析集中到一个 API 模块，保持 Demo 依赖最小。
- 使用 `rtc`/`rtcs`，复用仓库现有 ZLMRTCClient；不在 MVP 中加入 FLV/HLS 播放器，以避免播放器分支和无关依赖扩大范围。
- 复制播放器脚本到 Demo 自己的 `public/vendor`，避免 Demo 依赖 WVP 前端站点路径；复制源必须来自当前仓库版本。

## 未能由静态代码确认的事项

- 实际部署的 WVP 地址、ApiKey、设备编号、通道编号和媒体服务器外网/内网可达地址未知；均由 `public/config.json` 配置或由联调环境提供。
- 目标设备是否支持云台、WVP/ZLM 是否已启用可用 WebRTC/HTTPS 端口，静态代码无法确认；README 需将其列为联调前提，不通过增加额外功能解决。
