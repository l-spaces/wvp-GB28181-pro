# 实施计划：大屏接入 WVP 后端真实数据

## 前置

- [ ] 1. `visual/.gitignore` 加入 `.env`；新建 `visual/.env.example`（VITE_API_BASE_URL / VITE_API_KEY 占位）
- [ ] 2. `src/config/env.ts` 增加 `API_KEY` 导出

## 阶段一：API 层

- [ ] 3. 新建 `src/api/client.ts`：fetch 封装（api-key 头、5s/12s 超时、WVPResult code!=0 抛业务错、网络错误分类）
- [ ] 4. 新建 `src/api/wvp.ts` + `src/types/api.ts`：getDevices / getChannels / playStart / playStop / sendPtz / presetCall / cruiseStart / cruiseStop / getAlarmList / getResourceInfo，及各响应类型

验证：`pnpm build` 通过；curl 已验证的接口签名与代码一致

## 阶段二：数据 store

- [ ] 5. 新建 `src/stores/useDevices.ts`：设备+通道加载、映射为树节点（TreeRow 兼容现有 DeviceTree props）、30s 轮询、加载/错误状态
- [ ] 6. `DeviceTree.vue` 改造：数据源 mock → useDevices；folder 行 = 设备（onLine 状态），device 行 = 通道（status）；选中逻辑对接真实 deviceId/channelId

验证：dev 页面设备树显示后端真实 1 设备 1 通道

## 阶段三：播放（双播放器，与 demo 一致）

- [ ] 7. 已完成准备：`visual/public/vendor/`（jessibuca.js/decoder.js/decoder.wasm/ZLMRTCClient.js）+ `src/types/player.ts`（Jessibuca/ZLMRTCClient 类型）已从 demo 复制；`index.html` 引入 4 个 script
- [ ] 8. 新建 `src/players/` 封装：`createJessibuca(url, container)` / `createWebRtc(url, videoEl)` / 统一 destroy，播放模式枚举 `PlayerMode = 'jessibuca' | 'webrtc'`
- [ ] 9. `VideoWall.vue` 改造：卡片渲染真实通道（分屏数取前 N 个通道，不足显示空卡片占位）；点击卡片 playStart → 按当前模式播放（默认 jessibuca，工具栏可切换 webrtc）；卡片失活/组件卸载 playStop；显示通道名/PTZ 标签（ptzType>0）真实数据

验证：dev 页面点卡片出画面（当前环境 H265 流实测 ws_flv 可用）

## 阶段四：云台/统计/告警

- [ ] 10. `PtzPanel.vue` 改造：选中通道（v-model 改为通道对象 deviceId+channelId+name）；方向/变倍/预置位/巡航按钮对接真实接口；速度映射（1-10 → 25-250/15）
- [ ] 11. `FooterPanels.vue` 改造：统计区接 getResourceInfo + 告警表接 getAlarmList（30s 轮询，空态提示）；球机/枪机数从通道 ptzType 统计
- [ ] 12. `App.vue`：装配 store 加载，selectedCamera 类型改为通道标识

验证：dev 页面云台按钮触发后端成功（可看后端日志/msg）；统计数字与 curl 结果一致

## 阶段五：收尾

- [ ] 13. 错误占位统一处理（后端不可达时各区块提示）
- [ ] 14. `pnpm build` 全绿；README 增补"后端对接说明"章节
- [ ] 15. 删除 `src/data/mock.ts` 中不再使用的导出（feeds/treeRows/alerts 改由 api/store 提供；保留文件与否以最终引用为准）

## 检查点

- 每阶段结束跑 `pnpm build`（vue-tsc 严格检查）
- 播放验证依赖真实环境 http://192.168.1.100:18080 可达
- 不修改后端 Java 代码、不修改 demo/ 目录（只复制 vendor 文件）

## 回滚点

- 阶段一/二失败：还原 visual/src 即可
- 全部失败：git checkout visual/
