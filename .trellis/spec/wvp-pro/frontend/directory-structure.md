# Directory Structure

> 前端（`web/`，Vue 2 + Element UI）的目录结构与模块组织规则。

---

## Overview

- 技术栈：Vue 2 + Element UI + Vuex + vue-router，脚手架沿用 vue-element-admin，**不使用 Vue 3 Composition API**（`doc/编程规范.md` 第十四节）。
- 结构是「按技术层分目录」而不是「按业务域分包」：`api/` 放接口函数、`store/modules/` 放 Vuex action、`views/` 放页面、`router/index.js` 放路由。
- 一个后端业务模块通常对应 **1 个 api 文件 + 1 个 store module + 1 个 views 目录 + router 中的 1 段 route**。
- 页面通过 `this.$store.dispatch('<module>/<action>')` 取数，`views/` 里没有任何文件直接 `import` `@/api/*`（全库统计 0 处，`web/src/views` 全目录 grep `@/api`）。

---

## Directory Layout

```
web/
├── src/
│   ├── api/            22 个 *.js，一个后端模块一个文件（无 index.js）
│   ├── assets/         静态图片：404_images/、logo.png、login-bg.jpg、zlm-logo.png 等
│   ├── components/     全局通用组件目录：Breadcrumb/、Hamburger/、SvgIcon/
│   ├── directive/      自定义指令：el-drag-dialog/（拖拽弹窗）
│   ├── icons/          index.js + svg/（31 个图标，require.context 自动注册）
│   ├── layout/         后台框架：index.vue、components/（Navbar、Sidebar/、TagsView/、AppMain.vue）、mixin/ResizeHandler.js
│   ├── mixins/         dragZoom.js（被 views/common/h265web.vue、jessibuca.vue、rtcPlayer.vue 使用）
│   ├── router/         index.js（constantRoutes + 404 兜底）
│   ├── store/          index.js（集中注册全部 module）、getters.js、modules/（24 个 module）
│   ├── styles/         index.scss 入口，variables/mixin/transition/element-ui/sidebar/iconfont
│   ├── utils/          auth.js、diff.js、get-page-title.js、index.js、request.js、validate.js
│   ├── views/          18 个目录 + 404.vue，共 162 个 .vue
│   ├── App.vue
│   ├── main.js         注册 ElementUI / 全局插件 / 全局 $channelTypeList
│   ├── permission.js   路由守卫（登录态、默认密码强制改密）
│   └── settings.js     标题、fixedHeader、sidebarLogo、tagsView
├── mock/               模板遗留 mock（见下方反例）
├── tests/unit/         Jest 单测（components、utils）
└── vue.config.js       别名 @ -> src，dev 代理 /dev-api -> http://127.0.0.1:18080
```

`@` 别名指向 `src`，由 `web/vue.config.js` 的 `configureWebpack.resolve.alias` 与 `web/jsconfig.json` 的 `paths` 共同定义。

---

## Module Organization

### 落点规则

| 内容 | 位置 | 规则 |
|------|------|------|
| 后端接口函数 | `web/src/api/<module>.js` | 一个函数 = 一个后端接口，统一 `import request from '@/utils/request'` |
| 页面取数 | `web/src/store/modules/<module>.js` | `namespaced: true` + `actions` 返回 `Promise`，`resolve(data)` 只取 `response.data` |
| 可路由页面 | `web/src/views/<module>/index.vue` | 目录名小写；入口文件名固定 `index.vue`（18 个目录中 15 个带 `index.vue`，例外是 `views/common/`、`views/dialog/`、`views/operations/`） |
| 模块私有子组件 | `views/<module>/dialog/*.vue`、`views/<module>/common/*.vue`、`views/<module>/<sub>/*.vue` | 只被本模块引用，如 `views/recordPlan/dialog/linkChannelRecord.vue`、`views/device/common/ptzPresetConfig.vue` |
| 跨模块复用组件 | `web/src/views/common/*.vue` | 顶层 15 个 `.vue` + `VideoTimeLine/`、`map/` 子目录，如 `playerTabs.vue`、`DeviceTree.vue`、`MapComponent.vue`；**已有惯例用相对路径 import**（`import playerTabs from '../common/playerTabs.vue'`） |
| 跨模块弹窗选择器 | `web/src/views/dialog/*.vue` | 13 个文件，如 `GbDeviceSelect.vue`、`GbChannelSelect.vue`、`chooseCivilCode.vue` |
| 框架级组件 | `web/src/components/<Name>/index.vue` | 仅 3 个目录，且只在 `layout/` 或 `icons/index.js` 中注册，业务页面不要往这里加 |
| 图标 | `web/src/icons/svg/<name>.svg` | router `meta.icon` 的字符串必须与文件名一致（`el-icon-*` 走 Element 内置） |

### 新增一个业务页面的完整清单（4 个必改文件 + 2 个可选）

1. `web/src/api/<module>.js` — 每个后端接口一个 `export function`。
2. `web/src/store/modules/<module>.js` — `namespaced: true` + 同名 action 包装 api 函数。
3. `web/src/store/index.js` — `import` 并加入 `modules` 对象（当前 24 个 module 全部注册，无遗漏）。
4. `web/src/views/<module>/index.vue` + `web/src/router/index.js` 中新增一段 `component: Layout` 的 route。
5. 若需要在侧边栏出现：`meta.title` + `meta.icon`，图标文件放 `web/src/icons/svg/`；多个子路由但只想在侧边栏显示其中一个时，用 `onlyIndex: <子路由下标>`（如 `/channel`、`/cloudRecord` 的 `onlyIndex: 0`，`web/src/layout/components/Sidebar/SidebarItem.vue:61`）；只有一个可见子路由时不需要设置。
6. 非管理员默认看不到新菜单：`web/src/layout/components/Sidebar/index.vue:28` 的 `nonAdminMenuPaths` 白名单需要同步加 path，否则只有 `roleId === 1` 可见。

### 状态约定（与 state-management.md 呼应）

- 24 个 module 中 **20 个只有 `actions`**，没有 `state/mutations`；只有 `app`、`settings`、`tagsView`、`user` 带 `state`。业务模块只做「调接口 + 返回数据」，数据由页面组件自己持有。
- action 的固定写法（`web/src/store/modules/recordPlan.js:4-11`）：解构 `const { data } = response` 后 `resolve(data)`，异常 `reject(error)`。
- 因此页面里拿到的是**后端 `WVPResult.data` 本身**，不要再读 `.data.code`（`utils/request.js:47-52` 已统一判断 `code !== 0` 并抛 `msg`）。

---

## Naming Conventions

- **目录名小写**：`alarm`、`cloudRecord`、`recordPlan`、`streamProxy`、`jtDevice` 均为小写/小驼峰（例外：`views/common/VideoTimeLine/` 用大驼峰）。
- **api / store 文件名小驼峰**：`api/` 22 个文件、`store/modules/` 24 个文件全部无连字符（kebab-case 文件数为 0）。新增时不要引入 `xxx-yyy.js`。
- **`.vue` 文件名以小驼峰为主**：`views` 下 162 个 `.vue` 中 141 个小驼峰、20 个大驼峰、0 个 kebab-case（余下 1 个是 `views/404.vue`）。
  - 大驼峰只用于两类：一是**导出组件类**（`views/dialog/GbDeviceSelect.vue`、`views/common/DeviceTree.vue`、`views/dashboard/console/ConsoleCPU.vue`），二是被 `layout/` 引用的框架组件。
  - 因此：**新页面/新弹窗用小驼峰**（`playerDialog.vue`、`linkChannelRecord.vue`），**可复用的独立组件/选择器用大驼峰**（`GbDeviceSelect.vue`）。
- **api 文件名 = 后端 Controller 的资源名**，不是后端类名（`api/streamPush.js` 对应 `StreamPushController` 的 `/api/push`）。
- **store module 名必须与 `dispatch` 前缀一致**，已知两处不一致，新增代码不要模仿：
  - `web/src/store/modules/commonChanel.js`（拼写少一个 n）对应 `web/src/api/commonChannel.js`，调用侧写 `commonChanel/playback`。
  - `web/src/store/modules/userApiKeys.js` 对应 `web/src/api/userApiKey.js`。
- **route `name` 与组件 `name` 必须一致**：`AppMain.vue` 用 `<KeepAlive :include="cachedViews">`，`cachedViews` 里存的是 **route.name**（`layout/components/TagsView/index.vue:108`），而 KeepAlive 匹配的是**组件 name**。存量反例（不要模仿）：
  - `router/index.js:58` `name: '控制台'` vs `views/dashboard/index.vue:60` `name: 'Dashboard'` → 该页永不缓存。
  - `router/index.js:82` `name: 'Channel'` vs `views/channel/index.vue:193` `name: 'ChannelList'`。
  - `router/index.js:133` 的 `JTDeviceRecord` 与 `views/jtDevice/channel/record.vue:247` 的 `name: 'DeviceRecord'`，与 `views/device/channel/record.vue:237` 重名，两个页面共享缓存 key。

### api 文件与后端模块对应表（已核对 `RequestMapping`）

| 前端 api 文件 | URL 前缀 | 后端 Controller |
|---|---|---|
| `api/device.js` | `/api/device/query`、`/api/device/control`、`/api/device/config` | `gb28181/controller/DeviceQuery.java`、`DeviceControl.java`、`DeviceConfig.java` |
| `api/commonChannel.js` | `/api/common/channel`、`/api/common/channel/front-end` | `gb28181/controller/ChannelController.java`；`front-end` 子路径由 `ChannelFrontEndController.java` 处理 |
| `api/frontEnd.js` | `/api/front-end` | `gb28181/controller/PtzController.java` |
| `api/play.js` / `api/playback.js` | `/api/play` / `/api/playback` | `gb28181/controller/PlayController.java` / `PlaybackController.java` |
| `api/gbRecord.js` | `/api/gb_record` | `gb28181/controller/GBRecordController.java` |
| `api/platform.js` | `/api/platform` | `gb28181/controller/PlatformController.java` |
| `api/region.js` / `api/group.js` | `/api/region` / `/api/group` | `gb28181/controller/RegionController.java` / `GroupController.java` |
| `api/cloudRecord.js` | `/api/cloud/record` | `vmanager/cloudRecord/CloudRecordController.java` |
| `api/recordPlan.js` | `/api/record/plan` | `vmanager/recordPlan/RecordPlanController.java` |
| `api/alarm.js` | `/api/alarm` | `vmanager/alarm/AlarmController.java` |
| `api/user.js` / `api/role.js` / `api/userApiKey.js` | `/api/user`、`/api/role`、`/api/userApiKey` | `vmanager/user/UserController.java`、`RoleController.java`、`UserApiKeyController.java` |
| `api/jtDevice.js` | `/api/jt1078`、`/api/jt1078/terminal/*` | `jt1078/controller/JT1078Controller.java`；`terminal/*` 由 `jt1078/controller/JT1078TerminalController.java` 处理 |
| `api/streamProxy.js` / `api/streamPush.js` | `/api/proxy` / `/api/push` | `streamProxy/controller/StreamProxyController.java` / `streamPush/controller/StreamPushController.java` |
| `api/server.js` / `api/log.js` | `/api/server` / `/api/log` | `vmanager/server/ServerController.java` / `vmanager/log/LogController.java` |

---

## Examples

### 端到端示例一：录制计划（最小完整链路）

```
web/src/api/recordPlan.js                 # 7 个接口函数，URL 前缀 /api/record/plan
web/src/store/modules/recordPlan.js       # import 全部 7 个函数，7 个同名 action
web/src/store/index.js:17,46              # import recordPlan 并注册进 modules
web/src/views/recordPlan/index.vue        # dispatch('recordPlan/queryList')、dispatch('recordPlan/deletePlan')
web/src/views/recordPlan/edit.vue         # 新增/编辑弹窗，用 el-drag-dialog 指令 + ../common/weekTimePicker.vue
web/src/views/recordPlan/dialog/linkChannelRecord.vue  # 关联通道弹窗，用 ../../dialog/GbDeviceSelect.vue
web/src/router/index.js:185-197           # route name 'RecordPlan' = 组件名
```

对齐点：api 导出名 = store action 名 = 页面 dispatch 的 action 名（`queryList` / `deletePlan` / `linkPlan` …），新增接口时三处同名，便于检索。

### 端到端示例二：云端录像（含详情子路由）

```
web/src/api/cloudRecord.js                # 9 个接口函数，URL 前缀 /api/cloud/record
web/src/store/modules/cloudRecord.js      # 9 个同名 action，namespaced: true
web/src/store/index.js:18,47
web/src/views/cloudRecord/index.vue       # 列表页，name: 'CloudRecord'
web/src/views/cloudRecord/detail.vue      # 详情页，name: 'CloudRecordDetail'
web/src/views/cloudRecord/player.vue      # 播放器，复用 ../common/playerTabs.vue
web/src/views/cloudRecord/playerDialog.vue# 弹窗播放器，用 el-drag-dialog
web/src/router/index.js:198-217           # /cloudRecord 与 /cloudRecord/detail/:app/:stream，onlyIndex: 0
```

### 存量反例（不要模仿）

- `web/src/api/table.js` 是 vue-element-admin 模板残留（`url: '/vue-admin-template/table/list'`），全库无引用；新代码不要留死文件。
- `web/src/main.js:30-33` 在生产构建中调用 `mockXHR()`，与「生产构建不要新增 mock 接口」冲突；`web/mock/` 只在模板示例里存在，不要往其中加接口。
- `web/src/views/dialog/channelMapInfobox.vue:45`、`views/dialog/commonChannelEditDialog.vue:48`、`views/map/queryTrace.vue:77`、`views/operations/historyLog.vue:205` 使用 `this.$axios`，但 `web/src/` 下没有注册 `Vue.prototype.$axios`（`main.js` 只注册了 `$channelTypeList`），属于不可用写法；应改用 `@/utils/request`。
- `web/src/views/operations/showLog.vue:20,74` 在页面里直接 `import request from '@/utils/request'` 并调用，把接口调用写进视图；新代码应下沉到 `api/`。同类但更轻的反例：`web/src/views/device/dialog/timeStatistics.vue:60` 引入了 `request` 却没有使用。
- `web/src/api/user.js:51` 用模板字符串拼 `/api/user/delete?id=${id}`，应改为 `params: { id }`，与同文件其余写法保持一致。
- `web/src/views/common/` 下存在 `h265web.vue.bak`、`MapComponent_bak.vue`，备份文件不要提交。
