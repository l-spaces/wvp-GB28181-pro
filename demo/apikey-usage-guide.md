# WVP User ApiKey 第三方调用使用说明

> 本文档基于当前仓库源码分析整理，供后续编写第三方调用示例、联调说明和安全评审使用。
>
> 适用源码版本：当前工作区 `master` 分支源码。
>
> 文档范围：用户管理页面中的 `ApiKey` 生成与认证链路、实时视频播放、录像回放、媒体播放地址获取，以及设备/通道运行控制。

---

## 1. 结论速览

在 `user-settings.interface-authentication=true` 时，用户管理页面生成的 `ApiKey` 可以作为第三方访问 WVP HTTP API 的请求凭证：

- 可以调用实时点播接口，启动设备/通道取流并获取 FLV、HLS、WebRTC、RTSP 等播放地址。
- 可以调用录像查询、录像回放、暂停、恢复、拖动、倍速和停止接口。
- 可以调用云台、光圈、聚焦、预置位、巡航、扫描、雨刷、辅助开关等设备控制接口。
- 可以调用设备远程启动、手动录像、布防/撤防、报警复位、强制关键帧等设备级控制接口。
- 当前实现没有 ApiKey 级别的 `scope`、设备范围或通道范围；ApiKey 认证成功后，通常等同于该用户的通用接口身份。

**重要：ApiKey 不是媒体服务器的 `secret`，也不是 ZLMediaKit 的播放 URL 签名。**

- ApiKey 主要用于访问 WVP 的 HTTP API。
- 播放地址返回后，播放器连接媒体服务器时通常不会自动携带 `api-key` 请求头。
- 媒体层是否继续校验，主要由 ZLMediaKit `on_play` Hook、流类型和 `callId` 决定。

---

## 2. ApiKey 的本质

### 2.1 ApiKey 实际是 JWT

新增 ApiKey 时，WVP 先插入数据库记录，再生成一个 RS256 签名的 JWT，并将 JWT 保存到 `wvp_user_api_key.api_key` 字段。

JWT 中的主要信息包括：

| Claim | 作用 |
|---|---|
| `userName` | 绑定的用户名 |
| `apiKeyId` | 对应 `wvp_user_api_key.id`，用于检查该 ApiKey 是否仍存在、是否启用 |
| `sub` | 固定为 `login` |
| `aud` | 固定为 `Audience` |
| `exp` | 配置过期时间时存在 |

关键源码：

- `src/main/java/com/genersoft/iot/vmp/vmanager/user/UserApiKeyController.java:44-100`
- `src/main/java/com/genersoft/iot/vmp/conf/security/JwtUtils.java:228-263`
- `src/main/java/com/genersoft/iot/vmp/storager/dao/UserApiKeyMapper.java:15-17`

### 2.2 前端管理入口

用户管理页面点击“管理ApiKey”后打开 ApiKey 列表：

- `web/src/views/user/index.vue:52-58`
- `web/src/views/user/index.vue:196-198`
- `web/src/views/user/apiKeyManager.vue:28-32`

前端提供的管理接口：

| 操作 | 方法 | 路径 |
|---|---|---|
| 新增 | `POST` | `/api/userApiKey/add` |
| 查询 | `GET` | `/api/userApiKey/userApiKeys` |
| 启用 | `POST` | `/api/userApiKey/enable?id={id}` |
| 停用 | `POST` | `/api/userApiKey/disable?id={id}` |
| 重置 | `POST` | `/api/userApiKey/reset?id={id}` |
| 修改备注 | `POST` | `/api/userApiKey/remark` |
| 删除 | `DELETE` | `/api/userApiKey/delete?id={id}` |

前端请求封装见 `web/src/api/userApiKey.js:1-69`。

### 2.3 新增 ApiKey 的请求参数

```http
POST /api/userApiKey/add
access-token: <管理员登录令牌>
Content-Type: application/x-www-form-urlencoded

userId=<用户ID>&app=<应用名>&enable=true&expiresAt=2026-12-31%2023%3A59%3A59&remark=<备注>
```

参数说明：

| 参数 | 说明 |
|---|---|
| `userId` | ApiKey 所属用户 ID |
| `app` | 应用名称，仅用于标识和管理，目前不参与 ApiKey 权限判断 |
| `enable` | 是否启用；前端默认启用 |
| `expiresAt` | 页面格式为 `yyyy-MM-dd HH:mm:ss` |
| `remark` | 备注信息 |

新增成功时接口本身不返回 ApiKey 字符串；页面随后重新查询列表，在 ApiKey 列中显示完整密钥并支持复制。

---

## 3. 第三方认证方式

### 3.1 推荐：使用 `api-key` 请求头

第三方调用 WVP API 时，在每个需要认证的 HTTP 请求中加入：

```http
api-key: <ApiKey>
```

例如：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/device/query/devices/34020000001320000001'
```

当前代码没有显示对标准 `Authorization: Bearer ...` 的处理。示例应优先使用 `api-key` 请求头，而不要假设 `Authorization` 头可用。

### 3.2 WVP 的认证处理顺序

`JwtAuthenticationFilter` 的处理顺序如下：

1. 读取 `access-token` 请求头。
2. 如果没有，尝试读取 WebSocket 协议头或 `access-token` 查询参数。
3. 如果仍没有，读取 `api-key` 请求头。
4. 将读到的字符串作为 JWT 验证。
5. 从 JWT 的 `apiKeyId` 查询数据库记录。
6. 检查记录存在且 `enable=true`。
7. 根据 JWT 的 `userName` 加载用户，并构造 Spring Security 身份。

关键源码：

- `src/main/java/com/genersoft/iot/vmp/conf/security/JwtAuthenticationFilter.java:63-129`
- `src/main/java/com/genersoft/iot/vmp/conf/security/JwtUtils.java:282-328`

### 3.3 认证成功的必要条件

ApiKey 必须同时满足：

- JWT 签名有效，且使用当前服务加载的 RSA 公钥可以验证。
- JWT 尚未过期。
- JWT 中的 `apiKeyId` 在数据库中存在。
- 对应 ApiKey 记录的 `enable=true`。
- 用户仍可被按用户名查询。
- `interface-authentication` 已开启时，请求路径不属于未鉴权例外。

停用或删除 ApiKey 后，`JwtUtils.verifyToken()` 会因查不到启用记录而将令牌标记为失效。

---

## 4. 最小第三方调用示例

以下示例均使用占位符，不要把真实 ApiKey 提交到代码仓库、日志或前端公开资源中。

### 4.1 查询设备

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'count=20' \
  'https://wvp.example.com/api/device/query/devices'
```

查询通道：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'count=100' \
  'https://wvp.example.com/api/device/query/devices/<DEVICE_ID>/channels'
```

### 4.2 启动实时点播

```bash
curl -i \
  -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/play/start/<DEVICE_ID>/<CHANNEL_ID>'
```

成功后，响应通常是 WVP 统一结果对象，`data` 中包含 `StreamContent`。根据媒体服务器配置，可能出现以下字段：

```json
{
  "code": 0,
  "msg": "成功",
  "data": {
    "app": "rtp",
    "stream": "...",
    "flv": "http://media.example.com:80/rtp/....live.flv",
    "https_flv": "https://media.example.com:443/rtp/....live.flv",
    "hls": "http://media.example.com:80/rtp/.../hls.m3u8",
    "rtc": "http://media.example.com:80/index/api/webrtc?app=rtp&stream=...&type=play",
    "rtsp": "rtsp://media.example.com:554/rtp/..."
  }
}
```

字段是否存在取决于媒体服务器端口配置和转码配置，示例代码不能假设所有字段都非空。`StreamContent` 字段映射见：

- `src/main/java/com/genersoft/iot/vmp/vmanager/bean/StreamContent.java:116-195`
- `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMMediaNodeServerService.java:619-690`

### 4.3 停止实时点播

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/play/stop/<DEVICE_ID>/<CHANNEL_ID>'
```

对应接口：

```text
GET /api/play/stop/{deviceId}/{channelId}
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:145-166`。

---

## 5. 实时播放链路

实时点播的主要链路如下：

```text
第三方
  │  api-key: <ApiKey>
  ▼
WVP /api/play/start/{deviceId}/{channelId}
  │
  ├─ 校验 JWT 与 ApiKey 数据库状态
  ├─ 查询 Device / DeviceChannel
  ├─ 通过 GB28181 向设备发送点播命令
  ├─ 接收设备 RTP 媒体流
  ├─ 交给 ZLMediaKit 转换/输出
  └─ 返回 StreamContent 播放地址
         │
         ▼
第三方播放器连接 FLV/HLS/WebRTC/RTSP 等地址
```

入口源码：

- `PlayController.play()`：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java:79-143`
- 播放地址组装：`src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMMediaNodeServerService.java:619-690`

### 5.1 ApiKey 是否需要传给播放器

通常分两步：

1. **调用 WVP 播放 API**：传 `api-key` 请求头。
2. **连接返回的媒体地址**：按播放器协议连接返回地址。

例如浏览器中的 HLS 播放器或 WebRTC 客户端，不能简单假定它们会把 `api-key` 头自动传给媒体服务器。当前返回的播放 URL 也没有自动附加 WVP ApiKey。

不要把 ApiKey 拼接到媒体 URL 中，除非目标媒体服务和实际部署明确实现了这种约定。ApiKey 是 WVP API 凭证，不是 ZLM `secret`。

### 5.2 播放 URL 的媒体层鉴权

ZLMediaKit 的 `on_play` Hook 会触发播放鉴权：

- `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMHttpHookListener.java:78-95`
- `src/main/java/com/genersoft/iot/vmp/service/impl/MediaServiceImpl.java:45-57`

当前逻辑的关键点：

- `app=rtp` 时，`authenticatePlay()` 直接返回 `true`。
- 其他流类型在没有已登记 `callId` 时也可能直接放行。
- 如果流的 `StreamAuthorityInfo` 中存在 `callId`，则播放请求参数中的 `callId` 必须匹配。

因此，实时国标点播流的 WVP API 入口通常受 ApiKey 保护，但拿到播放地址后，媒体连接是否还需认证取决于流类型和 ZLM Hook 配置。播放地址、媒体端口和网络可达性必须作为整体进行安全设计。

---

## 6. 录像回放调用

### 6.1 查询录像

通用通道接口：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'channelId=<CHANNEL_DB_ID>' \
  --data-urlencode 'startTime=2026-09-07 00:00:00' \
  --data-urlencode 'endTime=2026-09-07 01:00:00' \
  'https://wvp.example.com/api/common/channel/playback/query'
```

接口：

```text
GET /api/common/channel/playback/query
```

时间格式：`yyyy-MM-dd HH:mm:ss`。

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelController.java:391-421`。

### 6.2 开始录像回放

按设备国标编号和通道国标编号：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'startTime=2026-09-07 00:00:00' \
  --data-urlencode 'endTime=2026-09-07 01:00:00' \
  'https://wvp.example.com/api/playback/start/<DEVICE_ID>/<CHANNEL_ID>'
```

接口：

```text
GET /api/playback/start/{deviceId}/{channelId}?startTime={startTime}&endTime={endTime}
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlaybackController.java:73-135`。

也可以使用通用通道 ID：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'channelId=<CHANNEL_DB_ID>' \
  --data-urlencode 'startTime=2026-09-07 00:00:00' \
  --data-urlencode 'endTime=2026-09-07 01:00:00' \
  'https://wvp.example.com/api/common/channel/playback'
```

### 6.3 回放运行控制

按回放返回的 `streamId` 或 `stream` 调用：

| 功能 | 接口 |
|---|---|
| 暂停 | `GET /api/playback/pause/{streamId}` |
| 恢复 | `GET /api/playback/resume/{streamId}` |
| 拖动 | `GET /api/playback/seek/{streamId}/{seekTime}` |
| 倍速 | `GET /api/playback/speed/{streamId}/{speed}` |
| 停止 | `GET /api/playback/stop/{deviceId}/{channelId}/{stream}` |

示例：

```bash
curl -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/playback/pause/<STREAM_ID>'

curl -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/playback/speed/<STREAM_ID>/2'

curl -H 'api-key: <API_KEY>' \
  'https://wvp.example.com/api/playback/seek/<STREAM_ID>/120'
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlaybackController.java:138-215`。

通用通道对应接口为：

```text
GET /api/common/channel/playback/stop?channelId=<CHANNEL_DB_ID>&stream=<STREAM>
GET /api/common/channel/playback/pause?channelId=<CHANNEL_DB_ID>&stream=<STREAM>
GET /api/common/channel/playback/resume?channelId=<CHANNEL_DB_ID>&stream=<STREAM>
GET /api/common/channel/playback/seek?channelId=<CHANNEL_DB_ID>&stream=<STREAM>&seekTime=<SECONDS>
GET /api/common/channel/playback/speed?channelId=<CHANNEL_DB_ID>&stream=<STREAM>&speed=<SPEED>
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelController.java:471-527`。

---

## 7. 设备和通道运行控制

以下接口与播放接口使用同一套 Spring Security 认证链路。当前源码未发现 ApiKey scope 或设备/通道授权校验，因此只要 ApiKey 认证成功，接口层面通常可以调用这些功能；最终是否成功还取决于设备在线状态、设备能力和 GB28181 支持情况。

### 7.1 云台、光圈、聚焦

#### 云台

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'command=left' \
  --data-urlencode 'horizonSpeed=100' \
  --data-urlencode 'verticalSpeed=100' \
  --data-urlencode 'zoomSpeed=1' \
  'https://wvp.example.com/api/front-end/ptz/<DEVICE_ID>/<CHANNEL_ID>'
```

接口：

```text
GET /api/front-end/ptz/{deviceId}/{channelId}
```

`command` 可用值：`left`、`right`、`up`、`down`、`upleft`、`upright`、`downleft`、`downright`、`zoomin`、`zoomout`、`stop`。

#### 光圈和聚焦

```text
GET /api/front-end/fi/iris/{deviceId}/{channelId}?command=in&speed=100
GET /api/front-end/fi/focus/{deviceId}/{channelId}?command=near&speed=100
```

相关源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/PtzController.java:74-214`。

### 7.2 预置位

```text
GET /api/front-end/preset/query/{deviceId}/{channelId}
GET /api/front-end/preset/add/{deviceId}/{channelId}?presetId=1
GET /api/front-end/preset/call/{deviceId}/{channelId}?presetId=1
GET /api/front-end/preset/delete/{deviceId}/{channelId}?presetId=1
```

源码：`PtzController.java:217-259` 及后续方法。

### 7.3 通用通道前端控制

通道数据库 ID 版本的控制接口包括：

```text
GET /api/common/channel/front-end/ptz
GET /api/common/channel/front-end/fi/iris
GET /api/common/channel/front-end/fi/focus
GET /api/common/channel/front-end/preset/query
GET /api/common/channel/front-end/preset/add
GET /api/common/channel/front-end/preset/call
GET /api/common/channel/front-end/preset/delete
GET /api/common/channel/front-end/tour/point/add
GET /api/common/channel/front-end/tour/point/delete
GET /api/common/channel/front-end/tour/speed
GET /api/common/channel/front-end/tour/time
GET /api/common/channel/front-end/tour/start
GET /api/common/channel/front-end/tour/stop
GET /api/common/channel/front-end/scan/start
GET /api/common/channel/front-end/scan/stop
GET /api/common/channel/front-end/scan/set/left
GET /api/common/channel/front-end/scan/set/right
GET /api/common/channel/front-end/scan/set/speed
GET /api/common/channel/front-end/wiper
GET /api/common/channel/front-end/auxiliary
GET /api/common/channel/front-end/home_position
GET /api/common/channel/front-end/drag_zoom_in
GET /api/common/channel/front-end/drag_zoom_out
```

云台示例：

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'channelId=<CHANNEL_DB_ID>' \
  --data-urlencode 'command=left' \
  --data-urlencode 'panSpeed=50' \
  --data-urlencode 'tiltSpeed=50' \
  --data-urlencode 'zoomSpeed=50' \
  'https://wvp.example.com/api/common/channel/front-end/ptz'
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelFrontEndController.java:39-646`。

### 7.4 设备级控制

```text
GET /api/device/control/teleboot/{deviceId}
GET /api/device/control/record?deviceId=<DEVICE_ID>&channelId=<CHANNEL_ID>&recordCmdStr=Record
GET /api/device/control/guard?deviceId=<DEVICE_ID>&guardCmd=SetGuard
GET /api/device/control/reset_alarm?deviceId=<DEVICE_ID>&channelId=<CHANNEL_ID>
GET /api/device/control/i_frame?deviceId=<DEVICE_ID>&channelId=<CHANNEL_ID>
GET /api/device/control/home_position?deviceId=<DEVICE_ID>&channelId=<CHANNEL_ID>&enabled=true
```

其中：

- `recordCmdStr`：`Record` 或 `StopRecord`
- `guardCmd`：`SetGuard` 或 `ResetGuard`

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/DeviceControl.java:34-212`。

这些接口可能直接改变现场设备状态。第三方开放时应单独评估，不能因为 ApiKey 名称中包含“API”就默认它只是只读播放凭证。

### 7.5 对讲、喊话

通用通道接口：

```text
GET /api/common/channel/talk/start?channelId=<CHANNEL_DB_ID>
GET /api/common/channel/talk/stop?channelId=<CHANNEL_DB_ID>
GET /api/common/channel/broadcast/start?channelId=<CHANNEL_DB_ID>
GET /api/common/channel/broadcast/stop?channelId=<CHANNEL_DB_ID>
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelController.java:355-389`。

对讲/喊话通常还依赖 WebRTC、RTP 端口和设备能力，能通过 HTTP API 触发控制不等于现场音频链路一定可用。

---

## 8. 查询或直接获取播放地址

### 8.1 根据 `app` 和 `stream` 查询已有媒体流

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'app=rtp' \
  --data-urlencode 'stream=<STREAM_ID>' \
  'https://wvp.example.com/api/media/stream_info_by_app_and_stream'
```

接口：

```text
GET /api/media/stream_info_by_app_and_stream?app=<APP>&stream=<STREAM>&mediaServerId=<OPTIONAL_ID>
```

如果流不存在，该接口可能尝试通过代理服务启动拉流后重试一次，不能把它单纯当作无副作用的查询接口。

### 8.2 获取推流播放地址

```bash
curl -G \
  -H 'api-key: <API_KEY>' \
  --data-urlencode 'app=<APP>' \
  --data-urlencode 'stream=<STREAM_ID>' \
  'https://wvp.example.com/api/media/getPlayUrl'
```

源码：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/MediaController.java:47-152`。

---

## 9. `/api/v1/**` 兼容接口的特殊情况

当前 `WebSecurityConfig` 将 `/api/v1/**` 加入默认放行路径：

```java
defaultExcludes.add("/api/v1/**");
```

源码：`src/main/java/com/genersoft/iot/vmp/conf/security/WebSecurityConfig.java:92-103`。

因此，在 `interface-authentication=true` 时，以下兼容接口仍可能不需要 ApiKey：

```text
GET /api/v1/stream/start?serial=<DEVICE_ID>&code=<CHANNEL_ID>
GET /api/v1/stream/stop?serial=<DEVICE_ID>&code=<CHANNEL_ID>
GET /api/v1/control/ptz?serial=<DEVICE_ID>&code=<CHANNEL_ID>&command=left
GET /api/v1/control/preset?serial=<DEVICE_ID>&code=<CHANNEL_ID>&command=goto&preset=1
```

相关源码：

- `src/main/java/com/genersoft/iot/vmp/web/gb28181/ApiStreamController.java:35-208`
- `src/main/java/com/genersoft/iot/vmp/web/gb28181/ApiControlController.java:24-154`

`/api/v1/stream/start` 会返回 FLV、HLS、RTMP、RTSP、WebRTC 等地址；`/api/v1/control` 提供云台和预置位控制。

**后续第三方示例应优先使用受 ApiKey 保护的新接口，不应依赖 `/api/v1/**` 的免鉴权行为。** 如果部署要求所有第三方访问都必须认证，应重新审查该放行规则、配置例外和反向代理规则。

---

## 10. 配置前提

### 10.1 开启接口鉴权

配置示例：

```yaml
user-settings:
  interface-authentication: true
```

源码配置参考：

- `src/main/resources/配置详情.yml:212-215`
- `docker/wvp/wvp/application-docker.yml:126-131`

当 `interface-authentication=false` 时，过滤器会直接构造认证上下文，ApiKey 不再是必要条件；此时应依赖网络隔离、反向代理或其他认证层保护接口。

### 10.2 媒体服务器可达性

WVP 返回的播放地址通常使用媒体服务器的 IP、域名和端口。第三方播放器必须能访问这些地址，而不只是能访问 WVP API。

需要确认：

- WVP API 域名/端口可达。
- 媒体服务器 HTTP/HTTPS/WebSocket/WebRTC/RTSP 端口按需开放。
- 返回地址中的内网 IP 是否需要通过反向代理或配置修正。
- 防火墙和 NAT 是否允许 RTP、WebRTC 相关端口。
- 浏览器场景是否满足 HTTPS、CORS 和 WebSocket 要求。

### 10.3 CORS、CSRF 和浏览器调用

当前配置中：

- CSRF 已禁用：`WebSecurityConfig.java:109-114`。
- CORS 允许的请求头和方法较宽：`WebSecurityConfig.java:130-149`。
- 未配置 `allowed-origins` 时，代码默认允许所有 Origin Pattern。
- 配置 `allowed-origins` 后，第三方浏览器页面必须在白名单内。

服务端到服务端调用不受浏览器 CORS 限制，但浏览器发起带 `api-key` 的跨域请求时仍会触发预检和来源校验。

---

## 11. 已确认的实现限制和风险

### 11.1 没有 ApiKey scope

当前 `UserApiKey` 字段只有用户、应用名、ApiKey、过期时间、备注、启用状态等信息，没有功能范围、设备范围或通道范围：

- `src/main/java/com/genersoft/iot/vmp/storager/dao/dto/UserApiKey.java:9-69`
- `src/main/java/com/genersoft/iot/vmp/conf/security/JwtUtils.java:312-317`

`app` 仅作为管理标识，不提供权限隔离。不要把 ApiKey 的 `app` 名称当作授权范围。

### 11.2 新增 ApiKey 的过期时间单位需要重点验证

前端传给新增接口的是绝对时间字符串，后端转换为毫秒时间戳：

```java
expirationTime = DateUtil.yyyy_MM_dd_HH_mm_ssToTimestampMs(expiresAt);
```

随后直接调用：

```java
JwtUtils.createToken(user.getUsername(), expirationTime, extra);
```

而 `JwtUtils.createToken()` 将该参数作为“未来多少分钟”使用：

```java
claims.setExpirationTimeMinutesInTheFuture(expirationTime);
```

源码：

- `UserApiKeyController.java:63-95`
- `JwtUtils.java:241-244`

因此当前新增流程存在“毫秒绝对时间戳被当成分钟数”的单位不一致。后续示例不要承诺页面填写的新增过期时间一定会按预期生效；生产使用前应修复或通过实测确认。

### 11.3 重置 ApiKey 后旧 JWT 不一定立即失效

认证流程按 JWT 的 `apiKeyId` 查询 ApiKey 记录并检查 `enable`，没有比较“请求 JWT 是否等于数据库当前保存的 `api_key`”。虽然数据库存在 `selectByApiKey()`，当前认证链路没有使用它：

- `UserApiKeyMapper.java:46-50`
- `JwtUtils.java:312-317`

因此重置后，如果旧 JWT 尚未过期且记录仍启用，旧 JWT 可能继续通过认证。停用或删除能使记录检查失败，但 ApiKey 生命周期策略仍应通过实测确认。

### 11.4 ApiKey 明文显示和查询

页面直接显示和复制完整 ApiKey：

- `web/src/views/user/apiKeyManager.vue:28-32`

查询 SQL 也返回完整 `api_key`：

- `src/main/java/com/genersoft/iot/vmp/storager/dao/UserApiKeyMapper.java:46-60`

ApiKey 应按密码或长期凭证处理：只在受控后台展示，避免写入浏览器日志、代理日志、异常日志、截图和聊天记录。

### 11.5 管理接口权限范围需要复核

`enable`、`disable`、`reset`、`remark`、`delete` 显式要求角色 ID 为 `1`，见 `UserApiKeyController.java:118-248`；但新增和查询方法本身未看到相同的显式角色判断，且 `userId` 由请求参数提供。

部署前应单独验证：

- 普通用户是否能调用新增接口。
- 普通用户是否能查询其他用户或全部 ApiKey。
- 返回数据是否只包含当前操作者有权查看的 ApiKey。

---

## 12. 推荐的第三方集成流程

### 12.1 服务端集成

推荐流程：

1. 管理员为专用集成用户创建 ApiKey。
2. 通过安全配置中心或密钥管理服务保存 ApiKey，不写死在源码中。
3. 第三方服务调用设备/通道查询接口，获取必要的 `deviceId`、`channelId` 或通道数据库 ID。
4. 调用播放或控制接口时统一附加 `api-key` 请求头。
5. 仅从播放接口响应中选择需要的媒体协议地址。
6. 保存播放会话的 `stream`/`streamId`，结束时主动调用停止接口。
7. 对 401、403、设备不存在、通道不存在、点播超时和设备不应答分别处理。
8. 记录调用审计信息，但禁止记录完整 ApiKey 和完整媒体密钥。

### 12.2 浏览器集成

浏览器前端不建议把长期 ApiKey 打包到 JavaScript、URL 或 HTML 中。更安全的模式是：

```text
浏览器 → 第三方后端（短会话） → WVP（ApiKey 保存在服务端）
                                  ↓
                           返回受控的播放信息
```

如果必须由浏览器直接调用 WVP：

- 使用 HTTPS。
- 严格配置 `allowed-origins`。
- ApiKey 不放在 URL 查询参数中。
- 评估浏览器开发者工具、扩展、XSS 和代理日志泄露风险。
- 播放地址本身也要考虑转发、复制和媒体服务器端口暴露问题。

### 12.3 推荐的最小权限改造方向

如果目标是“只允许第三方播放指定设备”，当前 ApiKey 机制不足，建议后续设计：

- 增加 ApiKey scope：只读、实时播放、录像回放、设备控制、对讲等。
- 增加 ApiKey 可访问的设备/通道关联表。
- 在每个控制器入口校验用户、ApiKey、设备/通道授权关系。
- 播放接口返回短时效、一次性或绑定会话的媒体签名 URL。
- 使用 token 版本、哈希或撤销列表确保重置后旧 Token 立即失效。
- 修复新增过期时间的毫秒/分钟单位问题，并增加单元测试。
- 关闭或保护不需要的 `/api/v1/**` 兼容接口。
- 隐藏 ApiKey 列表中的完整密钥，改为仅创建时显示一次或按权限临时显示。
- 为 ApiKey 增加审计、调用频率限制、来源 IP/网络策略和主动撤销能力。

---

## 13. 联调检查清单

### ApiKey 认证

- [ ] `user-settings.interface-authentication` 的实际值已确认。
- [ ] 使用 `api-key` 请求头，而不是未经确认的 `Authorization` 头。
- [ ] ApiKey 对应记录已启用。
- [ ] ApiKey 未过期，且服务端 RSA/JWK 配置未因重启发生变化。
- [ ] 401、403、400 和业务失败响应已分别处理。

### 设备播放

- [ ] `deviceId` 和 `channelId` 使用正确的国标编号。
- [ ] 设备和通道在线，且设备支持点播。
- [ ] WVP 能访问媒体服务器和设备 RTP 端口。
- [ ] 第三方网络能访问返回的媒体地址。
- [ ] 播放器选择了响应中实际存在的字段。
- [ ] 播放结束后调用停止接口，避免产生无用会话。

### 录像回放

- [ ] 时间格式为 `yyyy-MM-dd HH:mm:ss`。
- [ ] 保存返回的 `stream`/`streamId`。
- [ ] 暂停、恢复、拖动、倍速和停止使用了正确的流标识。
- [ ] 设备录像查询和媒体回放能力已验证。

### 设备控制

- [ ] 已明确第三方是否需要控制权限。
- [ ] 已限制可访问的设备和通道。
- [ ] 云台停止命令、录像停止命令等安全收尾动作已实现。
- [ ] 对讲、喊话、远程启动、布防/撤防等高风险操作有二次确认或审计。

---

## 14. 关键源码索引

| 主题 | 文件 |
|---|---|
| 前端用户入口 | `web/src/views/user/index.vue` |
| 前端 ApiKey 列表 | `web/src/views/user/apiKeyManager.vue` |
| 前端 ApiKey API | `web/src/api/userApiKey.js` |
| ApiKey 管理控制器 | `src/main/java/com/genersoft/iot/vmp/vmanager/user/UserApiKeyController.java` |
| ApiKey 数据对象 | `src/main/java/com/genersoft/iot/vmp/storager/dao/dto/UserApiKey.java` |
| ApiKey 数据库 Mapper | `src/main/java/com/genersoft/iot/vmp/storager/dao/UserApiKeyMapper.java` |
| JWT 生成与验证 | `src/main/java/com/genersoft/iot/vmp/conf/security/JwtUtils.java` |
| JWT 请求过滤器 | `src/main/java/com/genersoft/iot/vmp/conf/security/JwtAuthenticationFilter.java` |
| Spring Security 配置 | `src/main/java/com/genersoft/iot/vmp/conf/security/WebSecurityConfig.java` |
| 实时点播 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlayController.java` |
| 录像回放 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PlaybackController.java` |
| 通用通道播放/控制 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelController.java` |
| 通用前端控制 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelFrontEndController.java` |
| 设备级控制 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/DeviceControl.java` |
| 设备编号控制 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/PtzController.java` |
| 媒体地址接口 | `src/main/java/com/genersoft/iot/vmp/gb28181/controller/MediaController.java` |
| ZLM 播放鉴权 | `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMHttpHookListener.java` |
| 播放鉴权业务 | `src/main/java/com/genersoft/iot/vmp/service/impl/MediaServiceImpl.java` |
| 播放地址组装 | `src/main/java/com/genersoft/iot/vmp/media/zlm/ZLMMediaNodeServerService.java` |

---

## 15. 文档中的占位符约定

后续示例统一使用以下占位符：

| 占位符 | 含义 |
|---|---|
| `<WVP_BASE_URL>` | WVP HTTP API 根地址，例如 `https://wvp.example.com` |
| `<API_KEY>` | 用户管理页面创建的 ApiKey |
| `<DEVICE_ID>` | 设备国标编号 |
| `<CHANNEL_ID>` | 通道国标编号 |
| `<CHANNEL_DB_ID>` | WVP 通道数据库 ID |
| `<STREAM_ID>` / `<STREAM>` | 点播或回放响应返回的流标识 |
| `<MEDIA_URL>` | 播放接口返回的 FLV/HLS/WebRTC 等媒体地址 |

示例中不要使用仓库配置文件中的默认密钥、媒体 `secret` 或真实设备编号。
