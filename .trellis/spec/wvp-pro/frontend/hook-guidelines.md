# Hook Guidelines

> 本项目前端"逻辑复用"的真实约定。注意：文件名来自模板，本项目是 Vue 2，没有 Vue 3 Hooks。

---

## Overview

**结论：本项目不存在 Hook。** `web/package.json` 锁定 `"vue": "2.6.10"`（web/package.json:35），依赖里没有 `@vue/composition-api` 或 `vue-next`，代码中也没有 `Vue.mixin` / `Vue.extend` 的全局注册。`doc/编程规范.md` 第十四节明确要求"不使用 Vue 3 Composition API"。

"共享有状态逻辑"在本项目由四种手段承担，按使用频率排序：

| 手段 | 位置 | 承担职责 |
|------|------|----------|
| mixin | `web/src/mixins/`、`web/src/layout/mixin/`、组件同目录 | 带 data/computed/生命周期的可复用行为 |
| 生命周期钩子 | 各 `.vue` | 定时器、事件监听、播放器实例的启停 |
| 工具函数 | `web/src/utils/` | 无状态纯函数（时间格式化、Cookie、校验、diff） |
| Vuex action | `web/src/store/modules/` | 跨组件共享的服务器数据与加载状态 |

全局只扩展了一个原型属性：`Vue.prototype.$channelTypeList`（web/src/main.js:42），8 个组件使用；除此之外不要往原型上加东西。

---

## Custom Hook Patterns

### 现有 mixin 清单（全部真实文件，共 3 个）

**1. `web/src/mixins/dragZoom.js` — 播放器拖拽框选放大**

- 注入方式：`import dragZoom from '../../mixins/dragZoom'` + `mixins: [dragZoom]`，见 `web/src/views/common/h265web.vue:41,44`、`web/src/views/common/jessibuca.vue:35,38`、`web/src/views/common/rtcPlayer.vue:11,14`。
- 契约：mixin 提供 `data/computed/beforeDestroy/methods`，并**要求宿主组件实现 `getVideoElement()` 与 `getVideoRect()`**（`dragZoom.js:38,43,150`）；三个播放器各自实现（如 `h265web.vue` 用 `$refs.playerBox`，`jessibuca.vue` 取 `container canvas`，`rtcPlayer.vue` 按视频原始宽高比裁剪黑边）。
- 对外入口：`startDragZoom(callback)`（`dragZoom.js:138`），由 `web/src/views/common/playerTabs.vue:159-164` 转发给当前激活播放器，再由 `web/src/views/channel/player.vue:128-131` 的回调转成 PTZ 指令。
- 自带清理：`beforeDestroy() { this._removeCanvas() }`（`dragZoom.js:34`），`_removeCanvas` 内部先 `_unbindDragEvents()` 再移除 canvas。

**2. `web/src/layout/mixin/ResizeHandler.js` — 布局响应式/移动端侧边栏**

- 注入：`web/src/layout/index.vue:27` `mixins: [ResizeMixin]`。
- 生命周期成对：`beforeMount` 注册 `window.addEventListener('resize', this.$_resizeHandler)`，`beforeDestroy` 对应 `removeEventListener`（`ResizeHandler.js:14-19`）。
- 私有成员统一 `$_` 前缀：`$_isMobile`、`$_resizeHandler`（`ResizeHandler.js:28-36`），注释里明确引用 Vue 官方 style guide。

**3. `web/src/layout/components/Sidebar/FixiOSBug.js` — 修复 iOS 点击菜单触发 mouseleave**

- 注入：`web/src/layout/components/Sidebar/SidebarItem.vue:32,37`。
- 做法是 `mounted` 里改写 Element `el-submenu` 实例的 `handleMouseleave`（`FixiOSBug.js:7-20`）。这是对第三方组件实例打补丁，属于不得已手段，新代码不要照抄。

### 选择标准（该用哪种）

1. **需要 data + computed + 生命周期，且多个组件共享** → 写 mixin。参照 `dragZoom`：行为内聚、对外只暴露一个入口方法、依赖宿主实现少量约定方法。
2. **只操作 DOM/Canvas/event，不需要响应式状态** → 放 `web/src/utils/` 纯函数或独立 `.js`（例：`web/src/views/common/map/DragInteraction.js`）。
3. **要跨路由/跨组件共享的服务器数据** → 放 Vuex module（见下节 Data Fetching），不要用 mixin 兜。
4. **只是给单个组件打补丁** → 直接写在组件里，或像 `FixiOSBug.js` 一样放组件同目录，不要污染 `web/src/mixins/`。

### 命名与放置

- 目录分工：通用 mixin 放 `web/src/mixins/`；布局专用放 `web/src/layout/mixin/`；单组件补丁放组件同目录。
- 现状命名不一致（如实记录）：`ResizeHandler.js`、`FixiOSBug.js` 为 PascalCase，`dragZoom.js` 为 camelCase。新增 mixin 建议 default 导出对象、文件名用 camelCase（与 `dragZoom` 一致），并在组件里按业务名 import。
- 冲突防护：mixin 注入后 data/methods 会与组件合并，重名组件优先。新增 mixin 的内部方法/数据统一加 `_` 或 `$_` 前缀（现有 `dragZoom` 用 `_`，`ResizeHandler` 用 `$_`）。
- mixin 里不要写模板，不要依赖具体 DOM 结构；对宿主的依赖必须通过"宿主实现某方法"的显式契约表达，并在文件头一句话写清楚。

---

## Data Fetching

没有 React Query / SWR 之类的数据层，固定三段式：

```
组件 dispatch → Vuex action 包 Promise → web/src/api/*.js 单函数对应单接口 → @/utils/request
```

- 接口层：`web/src/api/` 下 22 个 js 文件，一个导出函数对应一个后端接口，统一 `import request from '@/utils/request'`（例：`web/src/api/device.js:1-20`）。
- 状态层：24 个 Vuex module 全部 `namespaced: true`，action 把 response 解包成 `data` 再 resolve（例：`web/src/store/modules/device.js:40-49`，`web/src/store/modules/streamPush.js:34-42`）。
- 拦截器已解包：`web/src/utils/request.js:43-53` 直接返回 `response.data`（即 `WVPResult`），`code` 非 0 时 `throw res.msg`。所以组件里只拿 `data`，**不要**再判断 `res.data.code`（那是"直接拿原始 axios"的旧写法，见下方反例）。
- 轮询取数：直接 `setInterval` + `destroyed` 清理，不引入轮询库。可参照 `web/src/views/device/list.vue:216-223`；需要暂停/恢复的用成对的 `startTask/stopTask`（`web/src/views/common/mediaInfo.vue:60-68`）。
- 播放器/媒体流推送依赖外部全局脚本（`web/public/index.html:11-16` 引入 jessibuca、ZLMRTCClient、h265web），这些对象**不是模块**，只能用 `window.XXX`，ESLint 里以 globals 声明（`web/.eslintrc.js` 的 `ZLMRTCClient`、`jessibuca`）。不要把它们包装成 hook。

---

## Naming Conventions

- 工具函数：动词开头 camelCase，按领域分文件——`web/src/utils/index.js`（`parseTime`/`formatTime`/`param2Obj`）、`auth.js`（`getToken`/`setToken`/`getRole`）、`validate.js`（`isExternal`/`validUsername`）、`get-page-title.js`、`diff.js`、`request.js`。
- 生命周期方法名与 Vue 2 一致：`created` / `mounted` / `beforeDestroy` / `destroyed`；**新代码的清理写 `beforeDestroy`**（组件仍可访问 DOM/`$refs` 时释放资源），存量代码两种都有。
- 事件监听处理器用 `onXxx`/`handleXxx` 且必须是具名函数引用，否则无法 `removeEventListener`（见反例 `weekTimePicker.vue`）。
- API 函数名与后端语义对齐：`queryDevices`、`deleteDevice`、`queryList`（`web/src/api/device.js`、`web/src/api/streamPush.js`），不要写成 `getData1` 之类。
- 私有资源字段命名：定时器 `updateLooper`（`device/list.vue:200`）或 `task`（`mediaInfo.vue:39`），自定义事件解绑回调 `destroyedCallback`（`showLog.vue:34`）——新代码沿用这些名字，便于 grep 全量排查泄漏。

---

## Common Mistakes

以下都是**存量反例（不要模仿）**，位置已核实：

1. **定时器清理用错 API。** `web/src/views/device/list.vue:222`、`web/src/views/jtDevice/list.vue:215`、`web/src/views/streamProxy/index.vue:167`、`web/src/views/streamPush/index.vue:190` 用 `clearTimeout` 去清 `setInterval` 的返回值；`web/src/views/dashboard/index.vue:81` 用 `window.clearImmediate` 清 `setTimeout` 的返回值（`clearImmediate` 在多数浏览器不存在，定时器实际泄漏）。正确写法：`setInterval` 配 `clearInterval`，`setTimeout` 配 `clearTimeout`，且在 `beforeDestroy` 里置空句柄。
2. **组件销毁但定时器仍在跑。** `web/src/views/common/mediaInfo.vue:42,60-68` 在 `startTask()` 里 `setInterval(..., 1000)`，组件本身没有 `beforeDestroy`，完全依赖父组件显式调用 `stopTask()`。`web/src/views/streamPush/player.vue:89,99`、`web/src/views/streamProxy/player.vue:89,99` 关闭弹窗时调了；但 `web/src/views/channel/player.vue:121-127` 与 `web/src/views/device/dialog/devicePlayer.vue:125-131` 的 `close()` 没有调 `stopTask()`，在"编码信息"标签页打开时关闭弹窗会留下定时器。
3. **document 上挂了监听但从不移除。** `web/src/views/common/weekTimePicker.vue:164-171` 在 `created` 里 `document.addEventListener('click'|'mousemove'|'mouseup', ...)`，全文件没有 `beforeDestroy`/`destroyed`（grep 为 0），且 click 用的是匿名箭头函数，即使想移除也无从下手。`web/src/views/cloudRecord/player.vue:151-153`、`web/src/views/cloudRecord/detail.vue:140-143` 同理，`destroyed()` 只调 `$destroy('recordVideoPlayer')`，没有 `removeEventListener`。
4. **`$destroy` 传参无意义。** 13 处 `this.$destroy('videojs')` / `this.$destroy('recordVideoPlayer')`（如 `web/src/views/device/list.vue:221`、`web/src/views/channel/record.vue:320`）——Vue 2 的 `$destroy()` 不接受参数，仓库内也没有注册过 `$destroy` 扩展（grep `Vue.prototype.$destroy` 无结果）。传的字符串被忽略，看着像"销毁播放器"实际只销毁了当前组件。要销毁子播放器实例，调用其自身方法（`playerTabs.destroy()`，`web/src/views/common/playerTabs.vue:131-136`）。
5. **WebSocket 挂在 window 上。** `web/src/views/operations/showLog.vue:92` 写 `window.websocket = new WebSocket(...)`，多实例互相覆盖；关闭动作 `destroyedCallback` 只在 `onopen` 里赋值（`showLog.vue:104-107`），若组件在连接建立前就销毁，socket 不会被关闭。正确做法：实例存在组件 data 上，`beforeDestroy` 里 `close()`，并注意认证信息不要走 subprotocol 之外的明文。
6. **ResizeObserver 不 disconnect。** `web/src/views/common/h265web.vue:82-86` 创建 `ResizeObserver` 并 observe 父节点，全仓库没有 `disconnect()` 调用，组件销毁后观察者仍持有 DOM。
7. **绕过 `@/utils/request` 直接发请求，而且 `$axios` 根本没注册。** `web/src/views/operations/historyLog.vue:205`、`web/src/views/dialog/commonChannelEditDialog.vue:48`、`web/src/views/dialog/channelMapInfobox.vue:45`、`web/src/views/map/queryTrace.vue:77`、`web/src/views/dialog/recordDownload.vue:171` 使用 `this.$axios(...)`，但 `web/src/main.js:35-38` 只注册了 ElementUI/VueClipboards/Contextmenu/VueClipboard，仓库内 grep `Vue.prototype.$axios` 无结果。新代码必须走 `web/src/api/*.js` + Vuex action；确实需要裸请求时用 `import request from '@/utils/request'`（参照 `web/src/views/operations/showLog.vue:20`、`web/src/views/device/dialog/timeStatistics.vue:60`）。
8. **mixin 里的调试日志。** `web/src/mixins/dragZoom.js:58,60,69,158,183,193` 有 `console.log`（`:69` 直接打印 DOM 对象 `this.$el`；`:158`、`:193` 打印 `JSON.stringify(videoRect)`、`JSON.stringify(params)`），生产构建只降级为 warn（`web/.eslintrc.js` 的 `no-console`）。往 mixin 里加日志前先确认是否有调试残留要删。

**新增代码的验收标准**：任何 `setInterval` / `setTimeout` / `addEventListener` / `new WebSocket` / `new ResizeObserver`，必须在同一文件里能找到成对的清理，且清理写在 `beforeDestroy`；复用逻辑先判断是纯函数（`utils/`）、带状态行为（mixin）还是共享数据（Vuex）；不引入 Composition API、数据请求库或全局 `Vue.mixin`。
