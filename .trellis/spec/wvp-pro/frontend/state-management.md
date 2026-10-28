# State Management

> 本项目（`web/`，Vue 2 + Element UI + Vuex 3.1.0）的状态管理约定。
> 依据：`doc/编程规范.md` 第十四节 + 现有代码实际写法。新代码遵守，存量代码逐步靠拢。

---

## Overview

- 状态方案固定为 **Vuex**（`web/package.json` 中 `"vuex": "3.1.0"`），store 在 `web/src/store/index.js` 组装，入口 `web/src/main.js:52` 注入。
- `store/index.js` 只做两件事：注册 `modules`（24 个）和根 `getters`，**没有 `plugins`、没有持久化插件、没有 `strict: true`** —— `web/src/store/index.js:31-59`。
- 24 个 module **全部** `namespaced: true`（如 `web/src/store/modules/device.js:332-336`），因此调用一律带命名空间：`this.$store.dispatch('device/queryDevices', ...)`。
- **本项目的 Vuex 主要不是缓存，而是「API 动作层」**：24 个 module 里只有 4 个定义了 `state`（`app`、`settings`、`user`、`tagsView`），其余 20 个（`device`、`play`、`region`、`commonChanel` 等）只有 `actions`，把 `@/api/*.js` 的返回值包成 Promise 后交给组件。
- 没有 `mutation-types.js` 常量文件，mutation 类型直接用大写字符串字面量作对象键（`web/src/store/modules/app.js:11-29`）。

## State Categories

三级状态的选择标准（按「谁需要读」判断，而不是按数据量）：

| 级别 | 判定标准 | 本项目真实例子 |
|---|---|---|
| 组件 `data` | 只有当前页面/组件和它的子组件用；页面销毁即应丢弃 | `views/live/index.vue:92-100` 的 `streamInfo`/`videoTip`/`spiltIndex`/`playerIdx`；`views/device/list.vue:193-205` 的 `deviceList`/`total`/`currentPage` |
| Vuex module | 跨页面共享，或**布局层组件**（`layout/`）需要读，或生命周期比路由长（登录态） | `user`（token/name/serverId/roleId/defaultPassword）、`app`（sidebar/device）、`settings`（静态配置）、`tagsView`（visitedViews/cachedViews） |
| 后端 | 真相源，前端只拉取、不推导 | 设备列表、通道列表、流信息；见 `views/device/list.vue:240-247` |

有 `state` 的模块与字段（可直接对照）：

- `app`：`sidebar.opened`（初始值从 Cookie `sidebarStatus` 读，`store/modules/app.js:3-9`）、`sidebar.withoutAnimation`、`device`（`desktop`/`mobile`）。
- `settings`：`showSettings`、`fixedHeader`、`sidebarLogo`、`tagsViews`。注意 `store/modules/settings.js:3` 解构了 `showSettings` 和 `tagsViews`，但 `web/src/settings.js` 只导出 `title`、`fixedHeader`、`sidebarLogo`、`tagsView`（单数）—— 因此 `state.showSettings`、`state.tagsViews` 实际是 `undefined`；`fixedHeader`/`sidebarLogo` 才是真实值。
- `user`：`token`、`name`、`serverId`、`roleId`、`defaultPassword`、`showConfirmBoxForLoginLose`（`store/modules/user.js:30-39`）。
- `tagsView`：`visitedViews`、`cachedViews`（`store/modules/tagsView.js:1-4`）。

**不要**把页面自己的列表塞进 Vuex：现有代码里设备列表、通道列表、流列表都停在组件 `data`，靠轮询刷新（见「Server State」）。

## When to Use Global State

### 判定顺序

1. 只有本页面用 → `data`。
2. 需要刷新、由后端产生 → `data` + 页面轮询（不复制到 Vuex，避免两份真相）。
3. 布局层（`layout/index.vue`、`layout/components/*`）或跨路由要读 → Vuex module。
4. 需要跨页面持久（登录态、侧边栏折叠）→ Vuex + `utils/auth.js` 的 Cookie 函数。

### 新增一个 Vuex module 的完整步骤

1. 新建 `web/src/store/modules/foo.js`，导出 `{ namespaced: true, state, mutations, actions }`（只读后端的模块可只写 `actions`，参考 `store/modules/play.js:46-49`、`store/modules/log.js`）。
2. 在 `web/src/store/index.js` 顶部 `import foo from './modules/foo'`，并加入 `modules: { ... }` 对象（`store/index.js:4-57`）。
3. 只有当**模块外**的组件需要读该 state 时，才在 `web/src/store/getters.js` 加一行 `xxx: state => state.foo.xxx`；否则组件直接 `this.$store.state.foo.xxx`。
4. 组件侧用 `this.$store.dispatch('foo/actionName', payload)`；需要自动映射 getter 时用 `mapGetters`（仅 `layout/components/Navbar.vue:40-43`、`layout/components/Sidebar/index.vue:33-36` 在用）。

### mutation 必须同步，action 负责异步与 api

- mutation 只改 state、必须同步；异步/请求放 action。`app` 的 `TOGGLE_SIDEBAR` 同步改 state 后写 Cookie（`store/modules/app.js:12-20`），`tagsView` 全部 mutation 也是纯同步（`store/modules/tagsView.js:6-67`）。
- action 统一写成返回 Promise 的函数，内部调 `@/api/*` 并解包 `response.data`：

```js
// web/src/store/modules/device.js:40-49
queryDevices({ commit }, params) {
  return new Promise((resolve, reject) => {
    queryDevices(params).then(response => {
      const { data } = response   // response 已是 WVPResult，data 是业务数据
      resolve(data)
    }).catch(error => reject(error))
  })
}
```

- 组件拿到的直接是业务数据，不再判断 `code`：`views/device/list.vue:245-247` 里 `data.total` / `data.list`。
- 多参数 action 一律收敛成**一个数组 payload**：`device/updateDeviceTransport` 传 `[deviceId, streamMode]`（`store/modules/device.js:60-69`），`play/play` 传 `[deviceId, channelId]`（`store/modules/play.js:4-13`）。

### token 的真实存储方式

- 用 **cookie**（`js-cookie` 2.2.0），不是 localStorage，也不是 Vuex 持久化。键名与有效期（`web/src/utils/auth.js:3-8`）：
  - `wvp_token`（30 天）、`wvp_username`、`wvp_server_id`、`wvp_role`、`wvp_default_password`。
- 登录成功后 `action` 同时写 Vuex 和 Cookie（`store/modules/user.js:77-87`），登出/过期时两者同时清（`store/modules/user.js:95-119`）。
- 请求头由 `utils/request.js:19-21` 统一注入 `access-token`，值取自 `store.getters.token`/`getToken()`。普通接口**不要在组件里手动拼 token**；`views/device/channel/upgradeConfig.vue:22`、`views/jtDevice/channel/index.vue:347`、`views/operations/showLog.vue:92` 是上传/WebSocket 等拦截器覆盖不到的路径，属特例，不要当成 api 请求的模板。
- 路由守卫读 cookie 判断是否登录，再用 `store.commit('user/SET_NAME', ...)` 回填 Vuex（`web/src/permission.js:20-33`），并用 `store.state.user.defaultPassword` 强制跳改密页（`permission.js:35`）。

## Server State

- **后端是真相源，Vuex 不缓存服务端列表。** 刷新责任在页面：`mounted` 起 `setInterval`，`destroyed` 里清掉。

```js
// web/src/views/device/list.vue:216-222（设备列表 10s）
mounted() { this.initData(); this.updateLooper = setInterval(this.getDeviceList, 10000) }
destroyed() { this.$destroy('videojs'); clearTimeout(this.updateLooper) }
```

- 同类轮询：`views/streamPush/index.vue:185-190`（2s）、`views/streamProxy/index.vue:177-184`（1s）、`views/common/mediaInfo.vue:60-62`（1s）、`views/jtDevice/list.vue:209-212`（10s）、`views/platform/index.vue:177-179`（10s）。
- 写操作后不自行改本地缓存，而是**重新拉取**：删除设备成功后再次 `this.getDeviceList()`（`views/device/list.vue:270-273`），同步设备后 `.finally(() => this.getDeviceList())`（`views/device/list.vue:317-319`）。
- 遗留写法是 `clearTimeout` 停 `setInterval`（`views/device/list.vue:222`）；新代码用 `clearInterval`，`clearTimeout` 能停掉定时器只是浏览器实现上的巧合，语义不应依赖。

## Common Mistakes

以下均是存量代码里的真实问题，**不要模仿**：

1. **引用不存在的 getter**：`views/channel/index.vue:137` 用 `$store.getters.authority !== 2` 控制编辑按钮，但 `store/getters.js`（共 13 行、10 个 getter：`sidebar/device/token/showConfirmBoxForLoginLose/serverId/roleId/name/defaultPassword/visitedViews/cachedViews`）没有 `authority`，取值恒为 `undefined`，条件恒真。新增 getter 必须同时改 `store/getters.js` 并确认调用点。
2. **`getters.js` 里闲置 getter**：`device`、`defaultPassword`、`visitedViews`、`cachedViews` 在 `src/` 中无引用（组件直接用 `this.$store.state.tagsView.visitedViews`）。不要为“以后可能用到”提前加 getter。
3. **action 只接收一个 payload，别写成多参数**：
   - `store/modules/device.js:280` 的 `queryDeviceTree({ commit }, params, deviceId)` 拿不到 `deviceId`，而 `api/device.js:277` 需要两个参数 —— 该 action 目前无人调用，属于坏样板。
   - 正确写法参考 `store/modules/device.js:60` / `:180`：一个数组或对象 payload，在 action 内解构。
4. **action 调错 api 函数**：`store/modules/device.js:210-212` 的 `querySubChannels` 实际调用 `deviceRecord(...)`，而 `api/device.js:202` 才导出 `querySubChannels`。复制粘贴 action 时必须改函数名和 import。
5. **组件绕过 `@/api` 直接发请求**：`views/device/dialog/timeStatistics.vue:60`、`views/operations/showLog.vue:20` 直接 `import request from '@/utils/request'`；`views/operations/historyLog.vue:205`、`views/map/queryTrace.vue:77`、`views/dialog/channelMapInfobox.vue:45` 用 `this.$axios(...)` —— 但 `src/main.js` 只注册了 `ElementUI`/`VueClipboards`/`Contextmenu`/`VueClipboard` 和 `Vue.prototype.$channelTypeList`（`main.js:35-42`），**没有注册 `$axios`**，这些调用拿不到实例（历史遗留）。新代码：一个后端接口 → `web/src/api/*.js` 一个函数 → 组件通过 dispatch 或直接调用 api 函数。
6. **组件直接改 `store.state`**：现有代码里组件只读（`layout/index.vue:30-36`、`layout/components/AppMain.vue:18-20`、`layout/components/TagsView/index.vue:44-46`），写一律走 `dispatch`/`commit`。新代码不要出现 `this.$store.state.x.y = ...`。
7. **localStorage 只写不读**：`views/live/index.vue` 把分屏和播放器写进 `localStorage` 的 `split`（:173）、`globalPlayer`（:183）、`playData`（:299-309），但初始化时没有读回（`data()` 里 `spiltIndex: 2`、`globalPlayer: 'jessibuca'` 是硬编码，`created` 只调 `checkPlayByParam()`）。要做持久化就成对实现「读回 → 校验 → 兜底默认值」，否则别写。
8. **页面轮询忘记清理**：`setInterval` 必须配对 `destroyed` 清理（见「Server State」），否则页面切走仍在打后端接口。新增列表页照抄 `views/device/list.vue:216-222` 的结构。
