# 技术设计：大屏接入 WVP 后端真实数据

## 已验证接口（真实环境 http://192.168.1.100:18080，api-key 认证通过）

| 区块 | 接口 | 验证结果 |
|---|---|---|
| 设备树-设备 | `GET /api/device/query/devices?page&count&query&status` | ✅ 返回 `{code,msg,data:{total,list[...]}}`，字段 deviceId/name/onLine/channelCount |
| 设备树-通道 | `GET /api/device/query/devices/{deviceId}/channels?page&count&online` | ✅ 字段 deviceId/name/status(ON/OFF)/ptzType |
| 全局通道 | `GET /api/common/channel/list?page&count&channelType=0` | ✅ gbDeviceId/gbName/gbStatus/gbPtzType |
| 播放 | `GET /api/play/start/{deviceId}/{channelId}` | ✅ data 含 ws_flv/fmp4/flv/rtsp 等；videoCodec=H265 |
| 停止播放 | `GET /api/play/stop/{deviceId}/{channelId}` | ✅（demo 已验证） |
| 云台 | `GET /api/front-end/ptz/{deviceId}/{channelId}?command&horizonSpeed&verticalSpeed&zoomSpeed` | ✅ command=right 成功下发 |
| 预置位 | `GET /api/front-end/preset/{add\|call\|delete\|query}/{deviceId}/{channelId}` | ✅ call 成功；query 命令超时（设备端无响应，属正常） |
| 巡航 | `GET /api/front-end/cruise/{start\|stop}/{deviceId}/{channelId}?cruiseId` | ✅ start 成功 |
| 告警 | `GET /api/alarm/list?page&count&alarmType&beginTime&endTime` | ✅ 接口可用，当前环境 0 条数据 |
| 统计 | `GET /api/server/resource/info` | ✅ data:{device:{total,online},channel:{total,online},push,proxy} |

不使用：`/api/group/tree/list`（分组树存在但通道不在分组内，需两跳查询）、SSE（复杂度高）。设备树直接用"设备列表 → 每设备通道列表"两级结构，与后端实际数据模型一致（当前环境 1 设备 1 通道）。

## 架构

```
src/
├── config/env.ts              # 已有：API_BASE_URL + 新增 VITE_API_KEY
├── api/
│   ├── client.ts              # fetch 封装：api-key 头、WVPResult{code=0}/分页双格式解析、超时、错误分类
│   └── wvp.ts                 # 领域接口：getDevices/getChannels/playStart/playStop/sendPtz/preset/cruise/getAlarms/getResourceInfo
├── composables/
│   └── useToast.ts            # 已有
├── stores/                    # 无 pinia，用组合式 store（模块级 ref）
│   └── useDevices.ts          # 设备/通道数据源：加载、轮询(30s)、树结构映射
├── components/                # 现有 8 组件，props 数据源从 mock 切换到 store/api
└── players/
    └── jessibuca.ts           # jessibuca 播放封装（H265 ws_flv）
```

## 关键决策

1. **播放器双模式（与 demo 一致）**：默认 **Jessibuca**（ws_flv，wasm 解码 H265），可切换 **WebRTC**（ZLMRTCClient.js，`play` 返回的 rtc 地址）。运行时文件已在 `visual/public/vendor/`（jessibuca.js/decoder.js/decoder.wasm/ZLMRTCClient.js，从 demo 复制），类型声明 `src/types/player.ts`（Jessibuca + ZlmRtcClient 全局 window 声明）也已复制。播放器统一封装为 `VideoPlayerCard` 内的切换逻辑，提供 UI 切换开关（视频墙工具栏或单卡操作按钮）。不再引入 h265web.js 外部库。
2. **视频墙按需播放**：9 分屏不自动拉 9 路流（设备只有 1 通道）。点击卡片 → play/start → jessibuca 播放；切换选中/翻页时 play/stop。空卡片显示"通道名 + 播放按钮"。
3. **设备树两级结构**：`设备(onLine) → 通道(status)`。mock 的四级层级（公司大楼/1号楼）无后端对应，直接呈现真实层级。
4. **返回格式双解析**：WVP 包装格式 `{code:0,msg,data}` 与裸分页 `{total,list}` 并存（实测 devices/channels/alarm 都是 code 包装，WVPResult 统一解析 + 保留裸格式兜底）。
5. **告警区**：调真实 `/api/alarm/list`（当前 0 条显示空态"暂无告警"）。字段映射：alarmTime/time、alarmType、channelDeviceId/设备名。
6. **统计区**：`resource/info` 的 device/channel total/online 直接填入；离线=total-online；报警=告警列表里 processing 数（无则 0）。球机/枪机分类用通道 ptzType 推断（ptzType>0 为球机）。
7. **云台**：方向键 → ptz command（上=up 下=down 左=left 右=right，中心=stop）；速度滑块 1-10 映射 horizon/vertical 0-255（×25）与 zoom 0-15。变倍+/-=zoomin/zoomout。聚焦/光圈按钮暂无对应简单指令（有 fi/focus、fi/iris 接口但参数复杂），保持 toast 提示。预置位 1-5 → preset/call?presetId=n；巡航开始/停止 → cruise/start|stop。
8. **API key 保密提示**：`VITE_API_KEY` 是前端暴露的 key（demo 同方案，接受此风险）。`.env` 含真实 key，加入 `.gitignore`，新建 `.env.example` 模板。
9. **快照**：保留 base64 快照逻辑作为图片兜底？不保留——真实通道无快照接口数据（`/api/device/query/snap` 是触发截图动作，不是查询），空卡片用纯 UI 占位。

## 数据流

- 加载：App 挂载 → useDevices.load()（设备列表 → 并发每设备通道列表）→ 树渲染；resourceInfo → 统计区；alarmList → 告警区
- 轮询：设备/通道/统计 30s，告警 30s
- 播放：点卡 → playStart(deviceId, channelId) → jessibuca 挂载播放；失焦/停止 → playStop
- 云台：组件事件 → api.sendPtz → toast 结果

## 兼容/降级

- 后端不可达：client 抛错 → 各区块显示错误占位（"无法连接后端"），不白屏
- 单接口失败：区块级降级，互不影响
- 预置位 query 超时：不影响 call（已知设备端可能不响应查询）

## 回滚

纯前端改动（visual/ 目录），git checkout visual/ 即可回滚。不动后端与 demo。
