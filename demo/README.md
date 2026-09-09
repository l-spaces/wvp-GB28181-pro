# WVP ApiKey 播放与云台控制 Demo

这是一个独立的 Vue 3 + TypeScript + Vite 示例，用于受控环境下联调 WVP 的单路实时视频播放和云台控制。示例只调用以下三个接口，不包含录像、对讲、预置位或设备管理功能。

- `GET /api/play/start/{deviceId}/{channelId}`
- `GET /api/play/stop/{deviceId}/{channelId}`
- `GET /api/front-end/ptz/{deviceId}/{channelId}`

## 1. 安装和运行

在本目录执行：

```bash
npm install
npm run dev
```

Vite 启动开发服务器后，用浏览器打开终端显示的地址。构建静态文件：

```bash
npm run build
```

构建产物位于 `dist/`，可以使用下面的命令进行本地预览：

```bash
npm run preview
```

本示例没有额外引入 ESLint 配置或 `npm run lint` 脚本；`npm run build` 会先执行 `vue-tsc --noEmit` 的严格 TypeScript 检查，再执行 Vite 生产构建。日常验证以该构建检查和浏览器手工联调为准。

部署时需要同时部署 `dist/config.json` 和 `dist/vendor/ZLMRTCClient.js`。`config.json` 是运行时配置，不会被打包进业务 JavaScript 中。

## 2. 配置运行时设备和 ApiKey

编辑 `public/config.json`，只需要替换配置文件中的占位值，不需要修改或重新构建业务源码：

```json
{
  "wvpBaseUrl": "https://wvp.example.com",
  "apiKey": "<API_KEY>",
  "devices": [
    {
      "deviceId": "<DEVICE_ID_1>",
      "name": "示例设备一",
      "channels": [
        { "channelId": "<CHANNEL_ID_1_1>", "name": "示例通道一" },
        { "channelId": "<CHANNEL_ID_1_2>", "name": "示例通道二" }
      ]
    },
    {
      "deviceId": "<DEVICE_ID_2>",
      "name": "示例设备二",
      "channels": [
        { "channelId": "<CHANNEL_ID_2_1>", "name": "示例通道一" },
        { "channelId": "<CHANNEL_ID_2_2>", "name": "示例通道二" }
      ]
    }
  ]
}
```

字段说明：

- `wvpBaseUrl`：浏览器可以访问的 WVP HTTP API 根地址，例如 `https://wvp.example.com`。不要填写 API 路径、查询参数或锚点。
- `apiKey`：在 WVP 用户管理页面创建并复制的 ApiKey。
- `devices`：非空设备数组；每个设备必须有非空且不重复的 `deviceId`、展示用 `name` 和非空 `channels` 数组。
- `channels`：每个通道必须有非空且在当前设备内不重复的 `channelId` 和展示用 `name`。

页面启动时会异步读取 `/config.json` 并进行运行时校验。文件不存在、JSON 无效、必填字段缺失、URL 无效、设备或通道为空、标识重复时，页面会显示配置错误，并且不会发送 WVP 请求。部署后只替换 `public/config.json` 时，必须保证它仍然和静态资源部署在同一目录层级。

## 3. ApiKey 请求方式

Demo 对 WVP API 的每个请求都使用 `api-key` 请求头：

```http
api-key: <API_KEY>
```

请求流程如下：

1. 点击“开始播放”后，Demo 使用当前设备和通道调用点播接口。
2. WVP 验证 ApiKey 并返回 `data` 中的流信息。
3. 页面在 HTTPS 页面优先选择 `rtcs`，其他页面优先选择 `rtc`；首选地址不存在时回退到另一个字段。Jessibuca 播放器按同样规则选择 `wss_flv`/`ws_flv` 地址。
4. 当前选择的播放器（Jessibuca 或 WebRTC）使用对应地址建立媒体连接，媒体连接本身不会附加 WVP ApiKey。播放中可随时切换播放器，Demo 会用同一会话的另一个地址重新连接，无需重新点播。
5. 点击“停止播放”或切换设备/通道时，Demo 先释放浏览器中的播放器，再调用停止点播接口。停止接口失败时仍会完成本地清理，并在页面显示失败原因。

WVP 的业务错误、HTTP 401/403、其他 HTTP 错误、网络错误、非 JSON 响应和缺少播放地址都会转换为页面提示，不会把完整 ApiKey 放进错误消息、URL 或路由参数。

## 4. 云台控制

先选择设备和通道，再在云台面板输入速度并点击按钮。每次请求的形式为：

```http
GET /api/front-end/ptz/<DEVICE_ID>/<CHANNEL_ID>?command=left&horizonSpeed=100&verticalSpeed=100&zoomSpeed=1
api-key: <API_KEY>
```

支持的 `command` 为：

- 方向：`left`、`right`、`up`、`down`
- 斜向：`upleft`、`upright`、`downleft`、`downright`
- 变倍：`zoomin`、`zoomout`
- 停止：`stop`

速度参数范围：

- `horizonSpeed`：水平速度，`0-255` 的整数。
- `verticalSpeed`：垂直速度，`0-255` 的整数。
- `zoomSpeed`：变倍速度，`0-15` 的整数。

输入为空、不是整数或超出范围时，按钮不可用且不会发送请求。请求期间按钮会进入“发送中”状态，防止同一个操作重复提交。`stop` 请求仍携带当前三个速度参数，WVP 服务端会按停止命令处理并归零。

## 5. 网络和浏览器前提

- 浏览器必须能访问 `wvpBaseUrl` 指向的 WVP 地址和端口。
- WVP 返回的媒体地址也必须能从浏览器直接访问；WVP API 可达并不代表媒体服务器地址可达。
- WVP 的 CORS 配置必须允许 Demo 页面的来源、`GET` 方法和 `api-key` 请求头。跨域时浏览器会先发送预检请求。
- HTTPS 页面应使用可访问的 `rtcs` 地址，媒体服务器必须提供相应的 HTTPS/WebRTC 能力。HTTP 页面使用 `rtc` 时也必须满足浏览器对媒体连接的安全策略。
- 浏览器需要支持 WebRTC。防火墙、NAT、反向代理和媒体服务器 WebRTC/ICE 端口必须按实际部署放通。
- Jessibuca 播放器通过 WebSocket-FLV 拉流并由 wasm 软解，支持 H265，仅要求媒体服务器的 `ws_flv`/`wss_flv` 端口可达；`vendor/jessibuca.js`、`vendor/decoder.js` 和 `vendor/decoder.wasm` 三个文件必须随静态资源一起部署。
- 播放地址中的主机名或内网 IP 必须对浏览器可解析、可路由；必要时应在 WVP/媒体服务器侧配置对外可用的地址，而不是修改 Demo 代码。

## 6. ApiKey 安全边界

这是纯前端联调示例。ApiKey 会在浏览器运行时进入页面，可以被开发者工具、浏览器扩展、代理和页面脚本查看，因此只适合受控的演示或测试环境：

- 不要在仓库源码、日志、截图、URL、媒体地址或错误消息中写入真实 ApiKey。
- 示例配置中的 ApiKey、设备编号和通道编号均为占位符；部署时请通过受控方式替换 `public/config.json`。
- 建议为联调创建专用用户和短时效 ApiKey，并限制 Demo 的部署来源和网络范围。
- 生产环境应使用后端代理或短时效、受控的授权方案，将长期凭证保存在服务端；本 Demo 不实现代理、密钥托管、权限细分或自动刷新。
- ApiKey 是 WVP HTTP API 的凭证，不是媒体服务器的 `secret`。不要把 ApiKey 拼到媒体 URL 中。

## 7. 故障排查

### 页面提示配置加载失败

确认部署产物中存在 `config.json`，且浏览器可以通过当前页面路径访问 `/config.json`。检查 JSON 语法、字段名称、设备/通道数组是否非空，以及标识是否重复。修改后刷新页面。

### HTTP 401 或 403

确认 ApiKey 是从 WVP 用户管理页面复制的完整值，且未过期、未停用，并且对应用户有权限。确认请求头名称是 `api-key`，不要把 ApiKey 放在 URL 查询参数中。不要在故障报告中粘贴完整 ApiKey。

### WVP 返回设备不存在、通道不存在或点播失败

核对 `deviceId` 和 `channelId` 是否为 WVP 使用的国标编号，确认设备在线并支持实时点播。查看 WVP 服务日志和页面显示的业务错误。

### 页面提示 CORS 或网络错误

确认 `wvpBaseUrl`、端口和 DNS 可从浏览器所在网络访问。检查 WVP CORS 是否允许当前 Demo 来源及 `api-key` 请求头，并检查反向代理是否放行预检请求。

### 已取得播放地址但播放失败

WebRTC 失败：在浏览器网络面板检查返回的 `rtc`/`rtcs` 地址是否可达，确认页面协议和地址协议匹配。检查媒体服务器 WebRTC/ICE 端口、防火墙、NAT、HTTPS 证书以及返回地址中的内网 IP。确认 `vendor/ZLMRTCClient.js` 已随静态资源部署且没有被代理返回 HTML。H265 流需要浏览器支持 WebRTC 接收 H265，否则请改用 Jessibuca 播放器。

Jessibuca 失败：检查返回的 `ws_flv`/`wss_flv` 地址是否可达，确认 `vendor/decoder.js` 和 `vendor/decoder.wasm` 已随静态资源部署（路径 `/vendor/decoder.js`），媒体服务器需以国内扩展标准（CodecID=12）封装 H265-FLV（ZLMediaKit 需设置 `[rtmp] enhanced=0`）。

### 云台请求失败或没有动作

确认当前设备和通道选择正确，速度在规定范围内，设备在线且具备云台能力。查看请求的 `command` 和四个查询参数，以及 WVP 返回的业务错误。Demo 只负责发送上述云台命令，不会查询或修改设备能力。

## 8. 功能范围

本示例仅实现单路实时播放（Jessibuca 或 WebRTC，可切换）、停止播放和指定通道的云台方向/变倍控制。录像回放、对讲、预置位、光圈、聚焦、巡航、扫描、雨刷、设备查询、登录页、ApiKey 管理页和服务端代理均不在范围内。
