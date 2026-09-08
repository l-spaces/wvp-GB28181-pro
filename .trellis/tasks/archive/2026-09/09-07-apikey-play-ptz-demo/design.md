# 技术设计：ApiKey 播放与云台控制 Demo

## 1. 目标与边界

在 `demo` 下新增一个独立的 Vue 3 + TypeScript + Vite 单页应用。应用只负责两类动作：

1. 用 `api-key` 请求头调用 WVP 实时点播 API，取得 WebRTC 播放地址并播放单路视频。
2. 用同一个 `api-key` 请求头调用 WVP 云台 API，控制当前选中的设备通道。

不改动 WVP 后端、不复用现有 `web` 工程的运行时路由/状态、不加入录像、对讲、预置位或其他设备功能。

## 2. 目录与模块边界

```text
demo/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/
│   ├── config.json                 # 部署后可替换的占位配置
│   └── vendor/
│       └── ZLMRTCClient.js         # 现有 WVP 播放器运行时副本
├── src/
│   ├── main.ts
│   ├── App.vue                     # 页面编排、配置加载、选择与动作状态
│   ├── api/
│   │   └── wvp.ts                  # fetch、URL、响应与错误边界
│   ├── components/
│   │   ├── VideoPlayer.vue         # ZLMRTCClient 生命周期封装
│   │   └── PtzPanel.vue            # 速度输入和云台命令按钮
│   ├── config/
│   │   └── loader.ts               # unknown -> Config 的运行时校验/规范化
│   └── types/
│       ├── config.ts
│       ├── player.ts
│       └── wvp.ts
└── README.md                       # 第三方使用说明
```

模块责任：

- `config/loader.ts` 是配置文件唯一解码入口；组件不直接读取未知 JSON。
- `api/wvp.ts` 是 WVP HTTP 合同唯一拥有者；组件不自行拼 URL 或解析响应。
- `VideoPlayer.vue` 只负责 WebRTC 播放器创建、事件转发和释放，不负责 WVP 点播 API。
- `PtzPanel.vue` 只负责控制输入和命令事件，不负责具体 HTTP 请求。
- `App.vue` 负责选择状态、播放会话编排、停止清理和用户可见状态。

## 3. 运行时配置合同

`public/config.json`：

```json
{
  "wvpBaseUrl": "https://wvp.example.com",
  "apiKey": "<API_KEY>",
  "devices": [
    {
      "deviceId": "<DEVICE_ID_1>",
      "name": "设备一",
      "channels": [
        { "channelId": "<CHANNEL_ID_1>", "name": "通道一" }
      ]
    }
  ]
}
```

TypeScript 类型：

```ts
interface DemoConfig {
  wvpBaseUrl: string
  apiKey: string
  devices: DeviceConfig[]
}

interface DeviceConfig {
  deviceId: string
  name: string
  channels: ChannelConfig[]
}

interface ChannelConfig {
  channelId: string
  name: string
}
```

加载器从 `unknown` 校验：对象、非空字符串、设备数组、通道数组、唯一/非空标识。错误必须携带用户可读原因。`wvpBaseUrl` 去除末尾 `/`，API 模块统一处理路径编码。

## 4. WVP API 合同

### 4.1 开始点播

```text
GET {wvpBaseUrl}/api/play/start/{encodeURIComponent(deviceId)}/{encodeURIComponent(channelId)}
Header: api-key: {apiKey}
```

预期响应：

```ts
interface WvpResult<T> {
  code: number
  msg?: string
  data?: T | null
}

interface StreamContent {
  rtc?: string | null
  rtcs?: string | null
}
```

API 模块先检查 HTTP 状态，再解析 JSON，最后检查 `code === 0` 和 `data`。播放地址按页面协议选择：HTTPS 页面优先 `rtcs`，其他页面优先 `rtc`；若首选缺失则回退另一字段；两者都缺失时报错。不将 ApiKey 添加到媒体 URL。

### 4.2 停止点播

```text
GET {wvpBaseUrl}/api/play/stop/{encodeURIComponent(deviceId)}/{encodeURIComponent(channelId)}
Header: api-key: {apiKey}
```

停止操作采用 `try/finally`：无论网络请求成功与否，App 都先/最终清理播放器并把失败反馈给用户。

### 4.3 云台控制

```text
GET {wvpBaseUrl}/api/front-end/ptz/{encodeURIComponent(deviceId)}/{encodeURIComponent(channelId)}
  ?command={command}
  &horizonSpeed={0..255}
  &verticalSpeed={0..255}
  &zoomSpeed={0..15}
Header: api-key: {apiKey}
```

允许命令为：`left`、`right`、`up`、`down`、`upleft`、`upright`、`downleft`、`downright`、`zoomin`、`zoomout`、`stop`。API 模块只接收已校验的参数，所有调用仍统一走 `request()`。

## 5. 播放器生命周期

- `index.html` 通过 `<script src="/vendor/ZLMRTCClient.js">` 提供全局 `window.ZLMRTCClient`。
- `VideoPlayer.vue` 接收 `url` 和 `playing`/`start` 事件边界；创建 `new window.ZLMRTCClient.Endpoint({ element, debug: true, zlmsdpUrl: url, simulecast: false, useCamera: false, audioEnable: true, videoEnable: true, recvOnly: true, usedatachannel: false })`。
- 监听 `WEBRTC_ON_REMOTE_STREAMS` 后报告播放成功；监听 ICE、Offer/Answer 和连接状态事件后报告失败/状态。
- 播放 URL 变化或组件卸载时调用 `close()` 并清空实例；禁止保留旧实例。
- 播放 API 成功后再创建播放器；播放器失败不会误报 WVP 点播 API 成功。

## 6. 页面状态与交互

最小页面布局：

- 顶部显示配置加载状态和当前操作提示。
- 设备选择下拉框；通道下拉框随设备变化更新。
- 视频区域和“开始播放/停止播放”按钮。
- 云台面板：速度输入、方向按钮和停止按钮。

状态至少包括：`loadingConfig`、`configError`、当前设备/通道、`isStarting`、`isPlaying`、`isStopping`、`ptzCommand`、`message`。未加载完成、配置无效、没有选中通道或请求忙碌时禁止相应动作。

切换设备/通道时：如果正在播放，先停止旧会话并完成本地清理，再更新选择；不会自动播放新通道，避免隐式触发设备动作。

## 7. 错误和安全边界

- 不把 ApiKey 写入日志、媒体 URL、路由参数或错误消息。
- 401/403 提示 ApiKey 无效、停用或无权限；不展示完整凭证。
- `fetch` 网络异常、非 JSON、WVP `code != 0`、缺失 WebRTC 地址和播放器事件异常分别转换为可读消息。
- 配置只在启动时加载；不提供页面内 ApiKey 编辑、刷新或持久化。
- 文档明确纯前端 ApiKey 可被浏览器查看，仅用于受控演示；生产环境应采用后端代理或短时效授权方案，但本次不实现。

## 8. 兼容性与部署

- Demo 是独立工程，`npm run dev` 用于开发，`npm run build` 生成静态产物。
- `public/config.json` 和 `public/vendor/ZLMRTCClient.js` 会原样复制到构建产物；部署方可以只替换 `config.json`。
- WVP API 的 CORS 必须允许 Demo 来源和 `api-key` 请求头；浏览器页面使用 HTTPS 时应选择 `rtcs`，媒体服务器必须提供相应 HTTPS/WebRTC 能力。
- WVP API 地址和返回的媒体地址都需要从浏览器网络可达；内网媒体地址不能仅因 WVP API 可达而视为可用。

## 9. 兼容与回滚

- 不修改既有模块，回滚只需删除 `demo` 新增工程文件和文档，不影响 WVP 服务行为。
- 播放器运行时固定使用当前仓库 `web/public/static/js/ZLMRTCClient.js` 的副本，升级时通过显式替换副本并重新验证构建。
