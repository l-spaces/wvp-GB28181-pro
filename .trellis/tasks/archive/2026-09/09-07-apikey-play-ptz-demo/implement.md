# 实现计划：ApiKey 播放与云台控制 Demo

## 前置条件

- [ ] 规划摘要经用户确认。
- [ ] 执行 `python ./.trellis/scripts/task.py start apikey-play-ptz-demo`，确认任务状态为 `in_progress`。
- [ ] 实现前调用 `trellis-before-dev`，刷新 `demo`/前端相关规范和检查清单。
- [ ] 保持现有工作区用户改动不被覆盖；只新增或修改 `demo` 相关文件及本任务工件。

## 实现步骤

1. [ ] 建立独立 Vue 3 + TypeScript + Vite 工程骨架：`package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts`。
2. [ ] 复制当前仓库 `web/public/static/js/ZLMRTCClient.js` 到 `demo/public/vendor/ZLMRTCClient.js`，增加最小全局 TypeScript 声明，不引入无关播放器或业务依赖。
3. [ ] 创建 `public/config.json` 占位配置，创建 `src/types/config.ts`、`src/types/wvp.ts`、`src/types/player.ts`。
4. [ ] 实现配置加载和运行时校验：处理加载失败、JSON 解析失败、字段缺失、空设备/通道、重复标识，并对 API 地址做规范化。
5. [ ] 实现 `src/api/wvp.ts`：统一 `api-key` 请求头、URL 编码、HTTP/业务响应解析、错误归一化；只实现开始点播、停止点播和云台控制三个 API。
6. [ ] 实现 `VideoPlayer.vue`：封装 ZLMRTCClient WebRTC 实例、成功/失败事件、URL 切换清理和卸载清理。
7. [ ] 实现 `PtzPanel.vue`：方向/停止按钮、速度边界输入、忙碌状态和命令事件；不加入预置位或其他控制。
8. [ ] 实现 `App.vue`：异步配置加载、设备/通道选择、播放开始/停止编排、播放器和点播会话生命周期、云台请求和页面消息反馈。
9. [ ] 编写 `demo/README.md`：安装、开发、构建、配置替换、ApiKey 安全边界、WVP/媒体服务器前提、播放与云台接口流程、故障排查。
10. [ ] 进行范围审查：确认没有录像、对讲、预置位、用户登录、设备查询、服务端代理等无关功能或依赖。

## 验证命令与检查

- [ ] `npm install`（在 `demo` 目录）。
- [ ] `npm run build`：TypeScript/Vite 构建成功。
- [ ] `npm run lint`（若工程配置 lint）：无错误；若不引入 lint，README 说明验证范围。
- [ ] `git diff --check`：无空白错误。
- [ ] 静态审查 `public/config.json`：仅占位符，无真实凭证。
- [ ] 静态审查 `src/api/wvp.ts`：开始、停止、PTZ 三个接口均使用 `api-key`，不包含其他业务 API。
- [ ] 静态审查 `App.vue`：停止时始终释放播放器；设备/通道切换不会遗留旧会话。
- [ ] 在可用 WVP 环境进行手工联调：启动播放、确认 WebRTC 画面、停止播放、逐个验证云台方向/停止及速度边界。

## 风险点与回滚点

- 若独立工程依赖版本与本机 Node/npm 不兼容，保留最小版本约束并先修正工程配置，不修改根项目依赖。
- 若 ZLMRTCClient 全局声明与实际运行时 API 不一致，以仓库现有 `rtcPlayer.vue` 的构造参数和事件名为准。
- 若 WVP 返回只含 `rtc` 或只含 `rtcs`，播放器选择逻辑必须正确回退并给出缺失地址错误。
- 若停止 API 网络失败，不得阻止本地播放器释放；这是会话泄露的关键回滚保障。
- 若范围检查发现额外功能，删除相关文件/依赖后再进入最终验证。
- 回滚点：工程骨架完成、API 模块完成、播放器完成、页面完成、文档完成；每个节点单独执行构建验证。

## Review Gate

在 `task.py start` 前确认：

- `prd.md` 无阻塞开放问题，需求和排除项已收敛。
- `design.md` 与 `prd.md` 一致，配置、API、播放器和清理责任明确。
- 本计划仅包含播放和云台控制。
- 用户已明确批准最新规划摘要后才开始实现。
