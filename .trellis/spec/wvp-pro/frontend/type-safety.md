# Type Safety

> 本项目前端「类型安全」的真实状态，以及在没有类型系统时靠什么兜底。

---

## Overview

**本项目没有 TypeScript，也不做任何静态类型检查。** 事实依据：

- `web/tsconfig*.json` 不存在；`web/src` 下 `.ts` 文件 0 个。
- `web/package.json` 的 dependencies / devDependencies 中没有 `typescript`、`vue-tsc`、`@vue/cli-plugin-typescript`。
- `web/jsconfig.json` 只有 `baseUrl` 与 `paths`（`@/* -> src/*`），没有 `checkJs`，只供编辑器跳转，不参与构建。
- `web/package.json:12` 的 `npm run lint` 只跑 `eslint --ext .js,.vue src`（风格规则）；`web/vue.config.js:29` 是 `lintOnSave: false`，构建不校验。

因此哪些错误只能在运行时暴露：

| 错误 | 暴露时机 |
|---|---|
| props 传错类型 | Vue 2 **开发构建**会打 console 警告 `Invalid prop: type check failed for prop "x"`（Vue 2 内置开发期校验），生产构建静默 |
| 读错后端字段名（拼写/大小写） | 读到 `undefined`，表现为「按钮没禁用」「标签空白」，通常不报错 |
| 字典表新增枚举值 | `字典[新值].xxx` 直接 TypeError |
| 接口返回结构变更 | 只能等对应页面被打开 |

**结论：本项目不提供静态类型检查，评审时以 props 契约与运行时空值判断为主。** 不要引入 TS，也不要假设有 JSDoc 类型体系——全库 `@param` 仅 17 处（其中 5 处在 `views/common/MapComponent_bak.vue` 备份文件里）、`@typedef` 0 处、`@returns` 5 处（全部在 `web/src/utils/index.js` 与 `validate.js`），`web/src/api/` 22 个文件 0 处 `@param`。

---

## Type Organization

没有类型文件。唯一的结构契约是 Vue 2 的 `props` 声明。现状（`web/src` 共 177 个 `.vue`，126 个有 props 声明）：

- 98 个 `props: { ... }` 对象式，其中 39 个是空的 `props: {}`。
- 30 个数组式，其中 6 个是空 `props: []`。
- 对象式里 `required: true` 只有 4 处：`components/SvgIcon/index.vue:17`、`layout/components/Sidebar/Link.vue:14`、`layout/components/Sidebar/Logo.vue:22`、`layout/components/Sidebar/SidebarItem.vue:42`。
- props 内 `validator` **0 处**。
- ESLint 关闭了 `vue/require-prop-types` 与 `vue/require-default-prop`（`web/.eslintrc.js:13-14`），所以数组式 props 不会被拦。

写新组件时的规则：**能用对象式就用对象式，写出 `type` + `default`**。真实正例：

```js
// web/src/components/SvgIcon/index.vue:14-23
props: {
  iconClass: { type: String, required: true },
  className: { type: String, default: '' }
}
// web/src/views/live/LivePtzPreset.vue:14-16；使用方 web/src/views/live/index.vue:64
props: { channelId: { type: String, default: null } }
```

可接受的数组式（模板遗留，新代码不要模仿）：`views/dialog/GbChannelSelect.vue:120` `props: ['dataType', 'selected']`、`views/common/GroupTree.vue:134`（9 个完全无类型）。

存量反例（不要模仿）：

- `web/src/views/device/channel/index.vue:251` `type: String || null` —— `String || null` 求值就是 `String`，并没有放宽为可空，只是让人误读。要表达可空请用 `default: null`。
- `web/src/views/common/VideoTimeLine/index.vue:150-153` `timeSegments: { type: Array, default: () => {} }` —— Array 的默认值工厂返回 `{}` 而非 `[]`，调用方 `views/channel/record.vue:75` 传的是数组，类型对不上时也不会报错。
- `web/src/views/common/DeviceTree.vue:54-57` 声明了 `device: { type: Object, default: () => ({}) }`，但组件内 grep 不到 `this.device`，props 声明了却没人用——没有工具会提示这类死声明。

---

## Validation

### 用户输入：el-form rules 是唯一的运行时边界

`web/src/utils/validate.js` 只有两个函数，且 **`validUsername` 是空实现**：

```js
// web/src/utils/validate.js:17-18
export function validUsername(str) {
  return str.length >= 0   // 永远 true
}
```

单测 `web/tests/unit/utils/validate.spec.js:4-7` 还把 `validUsername('xxxx') === true` 固化了。**不要把 validate.js 当作校验工具库使用**，真有需要就在组件内写 validator。

真实的表单校验全部内联在组件的 `rules` 里，用法固定：

```
<el-form :model="form" :rules="rules">
  <el-form-item label="x" prop="field">   ← prop 必须与 rules 的 key、model 字段名三者一致
...
this.$refs.form.validate(valid => { if (valid) { ... } })
```

- 简单必填（完整正例）：`web/src/views/common/CommonChannelEdit.vue:3`（`:rules="rules"`）→ `:270-275`（`gbName`、`gbDeviceId` 必填）→ `:313`（`this.$refs.channelForm.validate(valid => ...)`）。模板 `prop`、rules key、提交时 `validate` 三处齐备才算真正生效。
- 只写 rules 不写 validate 等于没校验：`web/src/views/device/edit.vue:14,16,87-89` 声明了 `deviceId` 必填，但 `onSubmit`（`:115`）直接 dispatch，该文件内 grep `validate` 为 0 处——这是存量反例，新增表单不要照抄。
- 自定义规则 + 字段间联动：`web/src/layout/components/dialog/changePassword.vue:42-77` 的 `validatePass0/1/2`，含密码强度正则、两次一致，并用 `this.$refs.passwordForm.validateField('confirmPassword')`（`:61`）触发确认框重校验；`views/user/dialog/addUser.vue`、`views/user/forceChangePassword.vue` 同款。

现状规模：459 个 `<el-form-item>`，只有 213 个带 `prop=`。**不带 `prop` 的表单项不会被 rules 校验**，提交时也没人拦——所以新增表单必须同时写 `prop` 与 `rules` 键。

存量反例（不要模仿）：

- `web/src/views/mediaServer/edit.vue:132-150`：自定义 validator `isValidIp` / `isValidPort` 忽略入参 `value`，固定读 `this.mediaServerForm.ip` / `this.mediaServerForm.httpPort`（`:135`、`:144`），于是 10 个端口字段共用 `isValidPort`（`:192-201`）却永远只校验 `httpPort`。
- `web/src/views/streamProxy/edit.vue`：`:11` 绑了 `:rules="rules"`，rules 键是 `name/app/stream/srcUrl/timeout/ffmpegCmdKey`（`:124-129`），而 form-item 的 prop 是 `type/app/stream/url/timeoutMs/rtpType/ffmpegCmdKey`（`:12,22,25,28,31,34,50`）——`url`/`timeoutMs` 对不上 `srcUrl`/`timeout`，`name` 没有对应 form-item，且 `onSubmit`（`:146`）根本没有调用 `validate`，整套规则不生效。
- `web/src/views/login/index.vue:76-78`：`validatePassword` 直接 `callback()` 空过，只有 `required` 生效。

### 后端必须重新校验

前端校验不是安全边界：`prop` 缺失、rules 键不匹配、`onSubmit` 忘写 `validate` 都不会有任何报错。所有约束在 Service 或 Controller 重新校验（见 `backend/error-handling.md`）。

---

## Common Patterns

### 后端响应的真实形状：WVPResult

```java
// src/main/java/com/genersoft/iot/vmp/vmanager/bean/WVPResult.java:24-28
private int code;     // 0 成功，非 0 失败
private String msg;
private T data;       // 失败时为 null
```

- 普通 Controller 返回值由 `conf/GlobalResponseAdvice.java:65` 自动包成 `WVPResult.success(body)`；`/api/v1`、`/index/hook`、`/api/video-`、`/v3/api-docs` 被排除（`:34`），这些路径返回的是裸结构。
- `utils/request.js:47-52` 统一判定：`if (res.code && res.code !== 0) throw res.msg; else return res`。注意 `res.code` 为 0 时短路，**没有 `code` 字段的响应会被当作成功**。
- `throw res.msg` 抛的是**字符串**，所以 `.catch(error => ...)` 里的 `error` 往往是 string 而非 Error。反例：`views/channel/index.vue:355`、`views/dashboard/dialog/hasStreamChannel.vue:141`、`views/device/channel/index.vue:426` 都写 `error.response.status === 402`——业务错误（字符串）走到这里会二次抛错。
- `utils/request.js:95` 的 `// return Promise.reject(error)` 被注释掉了，**HTTP 层错误不会 reject**，Promise 会以 `undefined` resolve。调用方 `.then(data => ...)` 必须容忍 `data` 为 undefined。

### 解构约定：页面拿到的是 data 本身

Vuex 层统一再拆一层（275 个 action 中 261 个是固定写法）：

```js
// web/src/store/modules/device.js:40-48
queryDevices({ commit }, params) {
  return new Promise((resolve, reject) => {
    queryDevices(params).then(response => {
      const { data } = response
      resolve(data)          // ← 交出 WVPResult.data
    }).catch(reject)
  })
}
```

所以页面里写 `data.total` / `data.list`（PageInfo），**不要**再写 `res.data.data.code`：

- `web/src/views/device/list.vue:246-247`、`views/channel/index.vue:303-304`、`views/alarm/index.vue:273-274`。

唯一例外：`web/src/store/modules/device.js:30-35` 的 `queryDeviceSyncStatus` 是 `resolve(response)`（整个 WVPResult），调用方 `views/device/dialog/SyncChannelProgress.vue:64` 用 `({ data, code, msg })` 解构。**同一个 module 里两种约定并存，改动前先读 action。**

### 判空纪律（没有类型系统时的唯一防线）

- 失败时 `data` 为 `null`：`views/device/dialog/SyncChannelProgress.vue:65` 先判 `if (data === null)` 再用。
- 字段可能缺失：`views/device/list.vue:297` `if (data && data.errorMsg)`。
- 反例（不要模仿）：`views/device/list.vue:326` `if (data.errorMsg !== null)` 少了 `data &&` 前置，`code != 0`（data 为 null）时直接 TypeError；紧随的 `:329` 又无条件覆盖 `result`，让前面的赋值失效。
- 反例（不要模仿）：`views/channel/index.vue:89`、`views/dialog/GbChannelSelect.vue:74` 等 9 处（分布在 8 个文件）直接写 `$channelTypeList[scope.row.dataType].style`，没有对 `undefined` 兜底；后端 `dataType` 是 `Integer`（`CommonGBChannel.java:139`），出现字典外的值（如 4）就是 `undefined.style` 崩溃。

### 枚举/状态值：现状是三套并行写法

- 唯一集中的字典：`web/src/main.js:42-47` 的 `Vue.prototype.$channelTypeList = { 1, 2, 3, 200 }`，对应后端 `src/main/java/com/genersoft/iot/vmp/common/enums/ChannelDataType.java:9-12`。新代码要加通道类型，必须同时改这两处。
- 设备在线是 **boolean**：`Device.onLine`（`src/main/java/com/genersoft/iot/vmp/gb28181/bean/Device.java:86`），序列化后字段名 `onLine`。
- 通道在线是 **字符串** `"ON"` / `"OFF"`：`CommonGBChannel.gbStatus`（`CommonGBChannel.java:81`，赋值 `:382`）。前端 36 处 `=== / !== 'ON'` 字面量比较（去掉 `MapComponent_bak.vue` 与注释后统计），散落在 `views/channel/index.vue:107-108,148-154,237`、`views/common/MapComponent.vue:171,180,415`、`views/common/GroupTree.vue:49,54,96,101` 等，**没有常量**。
- 存量反例（不要模仿，并且是真实 bug）：`views/device/list.vue:118,127,140,260` 读 `scope.row.online`（小写 l），而后端字段是 `onLine`，永远 `undefined`，于是 `:disabled="scope.row.online===0"` 恒为 false。同文件 `:83,88,90` 用的是正确的 `onLine`。
- 存量反例（不要模仿）：`views/dialog/channelMapInfobox.vue:13-14` 用 `channel.status === 1 / === 0` 数值判断在线，与其它页面的 `gbStatus === 'ON'` 不一致；`views/jtDevice/list.vue:82-83` 用 `scope.row.status` 真值判断（对应后端 `JTDevice.status` 是 `boolean`，这条本身没错，但说明「在线」在前端有数值/布尔/字符串三种表达，跨模块复制代码时极易搬错）。

新增状态判断时：取值以对应后端 Bean 的**真实字段名与类型**为准，先 Grep 后端类再写前端；同一语义不要在前端同时出现数值、布尔、字符串三种表达。

---

## Forbidden Patterns

- **不要引入 TypeScript / 类型检查工具链**（`ts-loader`、`vue-tsc`、`checkJs`）。现状是 Vue 2 + babel-eslint，引入会改动整个构建。
- **不要依赖 JSDoc 做契约**。全库只有 12 处非备份文件的 `@param`（5 处 `@returns` 全在 `utils/`），没有 `@typedef`，也没有工具会校验。
- **不要保留 `this.$axios`**。`web/src` 没有注册 `Vue.prototype.$axios`（`main.js` 只挂了 `$channelTypeList`），`views/dialog/channelMapInfobox.vue:45`、`views/dialog/commonChannelEditDialog.vue:48`、`views/map/queryTrace.vue:77`、`views/operations/historyLog.vue:205` 运行时不可用，统一改用 `@/utils/request`（经 `api/` + Vuex action）。
- **不要在 `.catch` 里假设 `error` 是 Error**。业务失败抛的是 `res.msg` 字符串（`utils/request.js:49`），HTTP 失败还要考虑 `request.js:95` 的 reject 被注释。
- **不要写 `props: []` / `props: {}` 占位**再往组件里塞业务字段；数组式 props 无类型，能不用就不用。
- **不要写死字典索引不做兜底**：`someDict[value].style` 必须写成 `(someDict[value] || {}).style` 或在 v-if 中先判断。
- **不要靠前端校验当安全边界**：`prop` 漏写、rules 键不匹配、忘调 `validate` 都不会报错，敏感约束必须在后端重做。
