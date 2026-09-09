# Research: WVP-GB28181-pro 后端 HTTP 接口调研（visual/ 大屏数据填充）

- **Query**: 为 visual/ Vue 大屏各数据区块找出最合适的后端 HTTP 接口
- **Scope**: internal（Java 源码）
- **Date**: 2026-09-08

## 通用约定（适用于所有区块）

- **认证**：所有接口走 Spring Security，除少数放行路径外均需认证。`JwtAuthenticationFilter`（`src/main/java/com/genersoft/iot/vmp/conf/security/JwtAuthenticationFilter.java:79`）在无 Authorization 头时会读取 `api-key` 请求头，`JwtUtils.API_KEY_HEADER = "api-key"`（`conf/security/JwtUtils.java:49`）。前端 fetch 示例见 `demo/src/api/wvp.ts`（`request()` 方法，`api-key` header + GET + JSON）。
- **放行（无需认证）路径**（`conf/security/WebSecurityConfig.java:88-104`）：`/v3/api-docs/**`、`/api/device/query/snap/**`、`/api/alarm/snap/**`、`/api/emit`、`/api/user/login`、`/api/jt1078/playback/download`、`/api/jt1078/snap`。其余全部 `anyRequest().authenticated()`。
- **统一响应包装** `WVPResult<T>`（`vmanager/bean/WVPResult.java`）：`{ code: int, msg: string, data: T }`，`code == 0` 为成功（demo/src/api/wvp.ts 也是按 `code !== 0` 抛错）。
- **分页包装** `PageInfo<T>`（pagehelper）：`{ total, page, list: T[], ... }`。
- **Swagger**：Controller 使用 springdoc 注解（`@Tag/@Operation`），路径前缀均为 `/api/...`，可在运行时 `doc.html` 查看。
- **路径前缀确认**：本仓库 Controller 分布在 `gb28181/controller/`、`vmanager/**/`、`web/gb28181/`（兼容层 `/api/v1/*`）、`streamProxy/`、`streamPush/`、`jt1078/` 等包。没有名为 `CommonGbChannelQueryController` 的类（不存在，待验证项无）；全局通道接口在 `ChannelController`（`/api/common/channel`）。

---

## 区块 1：设备树/通道列表

### 【推荐接口 A】设备列表（分页）
- **路径**：`GET /api/device/query/devices`
- **源码**：`gb28181/controller/DeviceQuery.java:88`（类前缀 `@RequestMapping("/api/device/query")`，DeviceQuery.java:47）
- **参数**：`page`（必填 int）、`count`（必填 int）、`query`（可选，搜索）、`status`（可选 Boolean，在线状态）
- **返回**：`PageInfo<Device>`，list 元素 `Device`（`gb28181/bean/Device.java`）关键字段：
  - `deviceId`（String，设备国标编号）、`name`、`manufacturer`、`model`
  - `onLine`（boolean，在线状态；注意 JSON 字段为 `onLine`）
  - `channelCount`（int，通道数）、`ip`/`port`、`registerTimeStamp`、`keepaliveTimeStamp`、`createTime`

### 【推荐接口 B】某设备下的通道列表（分页）
- **路径**：`GET /api/device/query/devices/{deviceId}/channels`
- **源码**：`DeviceQuery.java:98`
- **参数**：`page`、`count`（必填）、`query`、`online`（Boolean）、`channelType`（Boolean，true=子目录/false=设备）
- **返回**：`PageInfo<DeviceChannel>`，`DeviceChannel`（`gb28181/bean/DeviceChannel.java`）关键字段：
  - `deviceId`（所属设备编号）、`name`
  - 注意：DeviceChannel 中**没有直接叫 channelId 的字段**，通道国标编号存储在 `dbKey`（`DeviceChannel.java:194`）/查询结果中（实际以 `getOne(deviceId, channelDeviceId)` 按通道国标编号查询，见 DeviceQuery.java:211 `/channel/one`）。**待验证**：分页接口返回 JSON 中通道编号字段名（大概率是 `dbKey` 或序列化出的 `channelId`），建议实际请求确认。
  - `online`? — DeviceChannel 有 `status`（String，DeviceChannel.java:119）而非 boolean online。**待验证** status 取值。
  - 其他：`parentId`、`subCount`（子目录数）、`longitude`/`latitude`、`ptzType`（云台类型，1球机/3枪机等）、`hasAudio`

### 【推荐接口 C】全局通道列表（统一国标/推流/拉流，分页）
- **路径**：`GET /api/common/channel/list`
- **源码**：`gb28181/controller/ChannelController.java:133`（类前缀 `@RequestMapping("/api/common/channel")`，ChannelController.java:48）
- **参数**：`page`、`count`（必填）、`query`、`online`（Boolean）、`hasRecordPlan`、`channelType`（Integer：0国标设备/1推流/2拉流代理）、`civilCode`、`parentDeviceId`
- **返回**：`PageInfo<CommonGBChannel>`，`CommonGBChannel`（`gb28181/bean/CommonGBChannel.java`）关键字段：
  - `gbDeviceId`（所属设备国标编号）、`gbName`、`gbStatus`（String 状态）、`gbParentId`
  - **注意：CommonGBChannel 的 gbId 是数据库自增 id（int），不是通道国标编号**；通道国标编号与 `dataDeviceId`/`dataType` 相关（CommonGBChannel.java:139-142）。**待验证**：点播用 channelId 从此接口取哪个字段。
- 相关辅助：`GET /api/common/channel/map/list`（ChannelController.java:537，为地图返回 `List<CommonGBChannel>`，含经纬度）。

### 【备选 D】分组树（按业务分组/行政区划层级）
- **路径**：`GET /api/group/tree/list`
- **源码**：`gb28181/controller/GroupController.java:41`（类前缀 `@RequestMapping("/api/group")`）
- **参数**：`query`、`parent`（Integer 分组编号）、`hasChannel`（Boolean）
- **返回**：`List<GroupTree>`，`GroupTree` 继承 `Group`（`gb28181/bean/GroupTree.java`、`Group.java`）：`deviceId`（区域国标编号）、`name`、`parentId`、`parentDeviceId`、`treeId`、`isLeaf`、`type`（0行政区划/1摄像头）、`status`（在线状态，String）
- 配套（把通道挂到分组下）：`POST /api/common/channel/group/device/add`、`group/delete` 等（ChannelController.java:272-299）
- 行政区划树：`GET /api/region/tree/list`（RegionController.java:58，`/api/region` 前缀，返回 `List<RegionTree>`）

### 【备选 E】/api/v1 兼容层（ EasyCVR 风格，未加 api-key 也可鉴权）
- `GET /api/v1/device/list`（`web/gb28181/ApiDeviceController.java:58`）：返回 `{DeviceCount, DeviceList: [{ID, Name, Online, ChannelCount, ...}]}`（无 WVPResult 包装，直接 JSONObject）
- `GET /api/v1/device/channellist?serial=<设备编号>&code=<通道编号,多个逗号分隔>&online=`（ApiDeviceController.java:104）：返回 `{ChannelCount, ChannelList: [{ID(通道编号), DeviceID, DeviceName, DeviceOnline, Name, ParentID, Status, StreamID(有值表示正在直播), Longitude, Latitude, PTZType}]}`。该接口一次能拿到 deviceId+channelId+name+在线状态，字段名大写驼峰。

**推荐组合**：大屏设备树用 A（设备层）+ B（通道层，懒加载展开），或直接用 E 的 `channellist`（结构最省事但为兼容层，`@Hidden` 未在 swagger 展示）。

---

## 区块 2：视频播放地址

### 【推荐接口】开始点播
- **路径**：`GET /api/play/start/{deviceId}/{channelId}`
- **源码**：`gb28181/controller/PlayController.java:83`（类前缀 `@RequestMapping("/api/play")`，PlayController.java:53）
- **参数**：路径参数 deviceId（设备国标编号）、channelId（通道国标编号）。无查询参数
- **返回**：`DeferredResult<WVPResult<StreamContent>>`（异步，等待 SIP INVITE 完成，超时时间 `user-setting.play-timeout`）
- `StreamContent`（`vmanager/bean/StreamContent.java`）关键字段：
  - `app`、`stream`、`ip`（流媒体IP）
  - `flv`/`https_flv`/`ws_flv`/`wss_flv`（FLV 地址）
  - `fmp4`/`hls`/`ts` 各自的 http(s)/ws(s) 变体
  - `rtmp`/`rtmps`、`rtsp`/`rtsps`
  - `rtc`/`rtcs`（WebRTC 播放地址，jessibuca/ZLMRTCClient 用）
  - `mediaServerId`、`mediaInfo`、`startTime`、`endTime`、`progress`
- 前端类型已存在于 `demo/src/types/wvp.ts`（`StreamContent`/`PlayStartResponse`），解析逻辑在 `demo/src/api/wvp.ts` 的 `parseStreamContent`/`selectWebRtcUrl`/`selectFlvUrl`（注意 JSON 字段名是下划线：`ws_flv`、`wss_flv`、`rtc`、`rtcs`）。
- 成功时 `code=0`；超时 `code=ERROR100`，msg "点播超时"。

### 【配套】停止点播
- `GET /api/play/stop/{deviceId}/{channelId}`（PlayController.java:149），无返回体（void，demo 按 optional-json 处理）

---

## 区块 3：云台控制

### 【推荐接口】云台控制（已知确认）
- **路径**：`GET /api/front-end/ptz/{deviceId}/{channelId}`
- **源码**：`gb28181/controller/PtzController.java:82`（类前缀 `@RequestMapping("/api/front-end")`，PtzController.java:29）
- **参数**（query）：`command`（left/right/up/down/upleft/upright/downleft/downright/zoomin/zoomout/stop）、`horizonSpeed`（0-255，默认100）、`verticalSpeed`（0-255，默认100）、`zoomSpeed`（0-15，默认16）
- **返回**：void（无返回体，HTTP 200 即成功；命令发送失败抛 ControllerException → `code` 非 0 的 JSON 错误）

### 【预置位/巡航 — 存在，都在 PtzController（/api/front-end 前缀）】
全部 GET，路径参数 `{deviceId}/{channelId}`，返回 void（成功无 body）：

| 功能 | 路径 | 额外参数 | 源码行 |
|---|---|---|---|
| 查询预置位 | `/api/front-end/preset/query/{deviceId}/{channelId}` | 无 | PtzController.java:221 |
| 设置预置位 | `/api/front-end/preset/add/{deviceId}/{channelId}` | `presetId`(1-255) | :244 |
| 调用预置位 | `/api/front-end/preset/call/{deviceId}/{channelId}` | `presetId` | :256 |
| 删除预置位 | `/api/front-end/preset/delete/{deviceId}/{channelId}` | `presetId` | :268 |
| 加入巡航点 | `/api/front-end/cruise/point/add/{deviceId}/{channelId}` | `cruiseId`(0-255), `presetId` | :281 |
| 删除巡航点 | `/api/front-end/cruise/point/delete/{deviceId}/{channelId}` | `cruiseId`, `presetId`(0=删整组) | :294 |
| 巡航速度 | `/api/front-end/cruise/speed/{deviceId}/{channelId}` | `cruiseId`, `speed`(1-4095) | :310 |
| 巡航停留时间 | `/api/front-end/cruise/time/{deviceId}/{channelId}` | `cruiseId`, `time`(1-4095) | :328 |
| 开始巡航 | `/api/front-end/cruise/start/{deviceId}/{channelId}` | `cruiseId` | :345 |
| 停止巡航 | `/api/front-end/cruise/stop/{deviceId}/{channelId}` | `cruiseId` | :357 |
| 扫描开始/停止/边界/速度 | `/api/front-end/scan/start|stop|set/left|right|speed/...` | `scanId` 等 | :369-419 |
| 光圈 | `/api/front-end/fi/iris/{deviceId}/{channelId}` | `command`(in/out/stop), `speed`(0-255) | :153 |
| 聚焦 | `/api/front-end/fi/focus/{deviceId}/{channelId}` | `command`(near/far/stop), `speed` | :188 |
| 雨刷 | `/api/front-end/wiper/{deviceId}/{channelId}` | command 等 | :437 |

- 预置位查询返回：`DeferredResult<WVPResult<Object>>`，data 为 `List<Preset>`（`gb28181/bean/Preset.java`：`presetId`（String）、`presetName`（String））。**注意**：3 秒超时（PtzController.java:228）。

### 【备选：通用通道版（用数据库 channelId，支持国标+推流+拉流统一编号）】
`/api/common/channel/front-end/*`（`ChannelFrontEndController.java`，前缀 `@RequestMapping("/api/common/channel/front-end")`）：
- `GET .../ptz?channelId=&command=&panSpeed=&tiltSpeed=&zoomSpeed=`（:46，速度 0-100，返回 `DeferredResult<WVPResult<String>>`）
- `GET .../preset/query?channelId=`（:241，返回 `DeferredResult<WVPResult<List<Preset>>>`）、`preset/add`、`preset/call`、`preset/delete`（presetId 1-100）
- `GET .../tour/point/add|delete`、`tour/speed`、`tour/time`、`tour/start|stop`、`scan/*`、`wiper`、`auxiliary`、`home_position`、`drag_zoom_in/out`（:647/:692）
- 这里的 `channelId` 是**数据库自增 ID**（CommonGBChannel.gbId），不是国标通道编号。

大屏若沿用 demo 的 deviceId/channelId（国标编号）方式，用 `/api/front-end/*` 系列。

---

## 区块 4：告警信息

### 【推荐接口】报警列表（分页）
- **路径**：`GET /api/alarm/list`
- **源码**：`vmanager/alarm/AlarmController.java:35`（类前缀 `@RequestMapping("/api/alarm")`，@Tag("报警管理接口")）
- **参数**：`page`、`count`（必填）、`alarmType`（`List<AlarmType>`，可逗号分隔多值）、`beginTime`/`endTime`（`yyyy-MM-dd HH:mm:ss`）
- **返回**：`PageInfo<Alarm>`（注意：无 WVPResult 包装，直接返回 PageInfo），`Alarm`（`service/bean/Alarm.java`）字段：
  - `id`（Long）、`channelId`（int，数据库ID）、`channelDeviceId`（String，通道国标编号）、`channelName`
  - `alarmType`（`AlarmType` 枚举，见 `service/bean/AlarmType.java`，共 29 种：VideoLoss 视频丢失、MotionDetection 移动侦测、IntrusionDetection 入侵、TripwireDetection 绊线、DeviceHighTemperature 高温、StorageFull 磁盘满、Other 其他等）
  - `alarmTime`（Long 时间戳）、`description`、`snapPath`、`recordPath`、`longitude`/`latitude`
- **报警快照**：`GET /api/alarm/snap/{id}`（AlarmController.java:70，返回 image/jpeg，**此路径在 WebSecurityConfig 放行列表中，无需认证**）
- 数据来源：GB28181 设备主动上报的报警（`gb28181/transmit/event/request/impl/message/query/cmd/AlarmQueryMessageHandler.java` 等）写入。
- **限制说明（如实）**：这是"设备事件报警"存储/查询，没有独立的"设备状态变化（上下线）告警"接口；设备上下线不在 `/api/alarm/list` 中。如需上下线事件，目前无现成 REST 接口（**待验证**：`/api/emit` SSE 推送——该路径在放行列表里，可关注 `conf/` 下 SSE 相关实现，未深入调研）。

### 【实时订阅设备报警（向设备下发订阅）】
- `GET /api/device/query/subscribe/alarm?id=<通道数据库Id>&cycle=<秒>`（DeviceQuery.java:459），void 返回
- 主动查询设备历史报警（向设备发 SIP 查询）：`GET /api/device/query/alarm?deviceId=...`（DeviceQuery.java:290），`DeferredResult<WVPResult<Object>>`

---

## 区块 5：设备状态统计（在线/离线/总数）

### 【推荐接口】资源统计
- **路径**：`GET /api/server/resource/info`
- **源码**：`vmanager/server/ServerController.java:266`（类前缀 `@RequestMapping("/api/server")`，ServerController.java:52；注意 git status 显示此文件有未提交修改，实际部署版本以运行时为准）
- **参数**：无
- **返回**：`ResourceInfo`（`vmanager/bean/ResourceInfo.java`）：
  ```json
  {
    "device":  {"total": int, "online": int},   // 国标设备总数/在线
    "channel": {"total": int, "online": int},   // 通道总数/在线
    "push":    {"total": int, "online": int},   // 推流设备
    "proxy":   {"total": int, "online": int}    // 拉流代理
  }
  ```
  （`ResourceBaseInfo`，ResourceBaseInfo.java:4-6）
- **离线数 = total - online 自行计算**。

### 【其他可用统计】
- `GET /api/server/system/info`（ServerController.java:241）：`SystemAllInfo`（CPU/内存/网络等系统信息）
- `GET /api/server/media_server/list`（:98）`List<MediaServer>`（流媒体节点状态）、`/media_server/online/list`（:105）、`/media_server/load`（:250）`List<MediaServerLoad>`
- `GET /api/device/query/statistics/keepalive?deviceId=&count=`（DeviceQuery.java:437）/ `statistics/register`（:448）：`List<TimeStatistics>`（单设备心跳/注册历史，趋势图可用）
- `GET /api/position/latest?channelId=`（MobilePositionController.java:71）：最新位置；`/api/position/history/{deviceId}`（:55）

---

## 区块 6：直播流地址列表

### 【推荐接口 A】正在直播的通道列表
- **路径**：`GET /api/device/query/streams`
- **源码**：`DeviceQuery.java:118`
- **参数**：`page`、`count`（必填）、`query`（可选）
- **返回**：`PageInfo<DeviceChannel>`（只返回存在流的通道，内部 `queryChannels(query, true, ...)`）。拿到 deviceId/通道编号后可对每个通道调播放地址接口。

### 【推荐接口 B】按 app/stream 获取播放地址
- **路径**：`GET /api/media/stream_info_by_app_and_stream?app=&stream=&mediaServerId=&callId=`
- **源码**：`gb28181/controller/MediaController.java:60`（类前缀 `@RequestMapping("/api/media")`，MediaController.java:35）
- **返回**：`DeferredResult<WVPResult<StreamContent>>`（与区块 2 相同的 StreamContent 结构）
- **注意**：此接口带权限校验（callId 鉴权 或 登陆用户返回完整信息，MediaController.java:69-85）。api-key 认证是否等价于"登陆用户"（SecurityUtils.getUserInfo() 是否有值）**待验证**。

### 【相关】流媒体服务器 / 云端录像
- `GET /api/server/media_server/list`（ServerController.java:98）—— 流媒体节点信息（含 httpPort 等，可用于拼接 zlm 地址）
- `GET /api/cloud/record/list-url`（CloudRecordController.java:521，前缀 `/api/cloud/record`）：`PageInfo<CloudRecordUrl>`，分页查询云端录像并直接带播放 URL（参数 query/app/stream/page/count/startTime/endTime/mediaServerId/callId/remoteHost）
- `GET /api/play/ssrc`、`/api/play/snap`（PlayController.java:223/248）等辅助接口

### 【是否需要直接请求 zlm /index/api/*】
- **结论：不需要**。WVP 后端已封装了 zlm 的调用（`media/service/IMediaServerService` 系列），播放地址全部由 `/api/play/start`、`/api/media/*` 返回的 StreamContent 提供；zlm 的 `/index/api/*` 需要流媒体 secret，由后端持有，前端不应直连。**待验证**：WebRTC 播放（rtc/rtcs 地址）本身是 zlm 的 webrtc 端点，jessibuca 播放器会直接连该地址（播放数据面直连 zlm，控制面全部走 WVP API）。

---

## 附：统一响应与分页（再次确认）

- `WVPResult`：`{code, msg, data}`，成功 `code=0`（demo/src/api/wvp.ts 同样处理）
- `PageInfo`（pagehelper）：`{total, list, pageNum, pageSize, ...}`，**外层无 WVPResult 包装**（直接返回 PageInfo 的接口：DeviceQuery 全部、ChannelController、AlarmController、GroupController 等）
- `DeferredResult` 接口（点播/预置位查询/设备状态查询等）为异步，HTTP 层表现为：请求会挂起直到 SIP 应答或超时（点播默认超时较长，预置位查询 3 秒，设备状态查询默认超时）。前端 fetch 正常等待即可。

## Caveats / 待验证汇总

1. `DeviceChannel` 分页返回 JSON 中通道国标编号的字段名（`dbKey`？）需实际请求确认。
2. `CommonGBChannel.gbId` 是数据库 ID 不是国标编号；国标通道编号字段在 `dataDeviceId` 语义上仍待确认（对 `channel/one` 的 `channelDeviceId` 参数）。
3. `DeviceChannel.status`（String）的取值枚举（ON/OFF？）未查。
4. api-key 认证在 `/api/media/stream_info_by_app_and_stream` 的 `SecurityUtils.getUserInfo()` 权限路径下是否生效，待验证。
5. 设备上下线事件无 REST 告警接口；`/api/emit`（SSE，放行路径）是否能推送设备状态变化未深入调研。
6. `ServerController.java` 当前有未提交的工作区修改（git status: M），线上行为以部署版本为准。
7. demo/src/types/wvp.ts 的 `PlayStartResponse` 里的 `webRtcUrl`/`flvUrl` 是 demo 自行从 StreamContent 挑选派生的字段，不是后端原生字段。

---

## 二次验证补充（2026-09-08 下午，真实环境实测）

### 关键发现：两套通道标识体系

- **国标编号**（字符串 `10000000001321010801`）：`/api/front-end/*`、`/api/play/*`、`/api/device/query/devices/{deviceId}/channels` 使用
- **数据库主键**（整数 `4`，即通道列表里的 `gbId`）：`/api/common/channel/front-end/*`（聚焦/光圈/拉框/看守位/预置位）使用，传国标编号会报 "Failed to convert to Integer"
- 通道列表接口 `/api/device/query/devices/{deviceId}/channels` 返回里同时有 `deviceId`（国标）和 `gbId`（主键），前端两个都要存

### 补充实测通过的接口

| 接口 | 用途 | 参数 |
|---|---|---|
| `GET /api/common/channel/front-end/fi/focus` | 聚焦± | channelId(整数)、command=near/far/stop、speed 0-100 |
| `GET /api/common/channel/front-end/fi/iris` | 光圈± | 同上 command=in/out/stop |
| `GET /api/common/channel/front-end/drag_zoom_in` | 拉框放大 | channelId + length/width/midPointX/midPointY/lengthX/lengthY 像素值 |
| `GET /api/common/channel/front-end/drag_zoom_out` | 拉框缩小 | 同上（实测 500：设备端未实现该能力，接口存在） |
| `GET /api/common/channel/front-end/home_position` | 看守位 | channelId、enabled、resetTime、presetIndex（实测 500 enabled=null 需全参数） |
| `GET /api/server/media_server/media_info` | 视频信息面板 | app=rtp、stream、mediaServerId=zlm-01；返回 readerCount/videoCodec/width/height/fps/loss/aliveSecond/bytesSpeed |

### 已知限制（实测确认）

- 预置位查询 `/api/front-end/preset/query` 返回 code=100 超时（设备端不响应查询指令，但 call 可用）
- 设备上下线事件无 REST 接口（SSE `/api/emit` 存在未深挖），统计靠轮询 `/api/server/resource/info`
- `/api/alarm/list` 接口可用但当前环境 0 条数据
