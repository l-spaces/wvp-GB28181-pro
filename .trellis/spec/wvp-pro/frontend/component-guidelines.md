# Component Guidelines

> How components are built in this project.

---

## Overview

- 前端是 **Vue 2.6.10 + Element UI 2.15.14**（`web/package.json:23,35`），**只用 Options API**。
  全量 `web/src` 里没有 `defineComponent`、`<script setup>`、`setup()`、`reactive()`，不要引入 Vue 3 写法。
- 组件分两类：
  - 页面组件在 `web/src/views/<模块>/`，共 162 个 `.vue`；子模块再建目录（如 `views/channel/common/`）。
  - 通用组件在 `web/src/components/`，当前只有 3 个：`Breadcrumb/index.vue`、`Hamburger/index.vue`、`SvgIcon/index.vue`。
    其中 `SvgIcon` 在 `web/src/icons/index.js:5` 被 `Vue.component('svg-icon', SvgIcon)` 全局注册，其余按需局部注册。
- 数据获取链路固定为 **组件 → `$store.dispatch('<module>/<action>')` → `web/src/api/*.js` → `@/utils/request`**。
  `views/` 下没有一处 `import ... from '@/api/'`（全部 22 个 `@/api` 引用都在 `store/modules/`），新增页面照此分层。
- 规范出处：`doc/编程规范.md` 第十四节；本文件只负责组件层。

---

## Component Structure

### 文件骨架与选项顺序

模板 → `<script>` → `<style>`，`export default` 内按 **name → components → directives → mixins → props → data → computed → watch → 生命周期 → methods** 排列。
参考 `web/src/views/common/playerTabs.vue:46-53`、`web/src/views/common/DeviceTree.vue:51-86`：

```js
export default {
  name: 'PlayerTabs',
  components: { jessibucaPlayer, rtcPlayer, h265web },
  props: {
    hasAudio: { type: Boolean, default: false },
    showButton: { type: Boolean, default: true },
    showTab: { type: Boolean, default: true }
  },
  data() {
    return { streamInfo: null, activePlayer: 'jessibuca' /* ... */ }
  },
  computed: { /* ... */ },
  created() { /* ... */ },
  methods: { /* ... */ }
}
```

### 命名与注册

- 文件名：页面用小驼峰（`playerTabs.vue`、`ptzConfig.vue`），可复用组件/选择器用大驼峰（见 `directory-structure.md`），`components/` 下用 `目录/index.vue`；不要用 kebab-case。
- `name` 必填：177 个 `.vue` 中 169 个声明了 `name`。命名现状两种风格都存在：
  页面用 PascalCase（`AlarmManage`、`ChannelPlayer`）、通道/云台子组件带 `Ch` 前缀（`ChPtzPreset`、`ChPlayerPtzPanel`，`views/channel/common/ptzPreset.vue:17`）。
  新代码沿用 PascalCase 即可，不要新造前缀体系。
- 局部注册一律 `components: { 局部名 }`，import 名与文件同名（`views/device/index.vue:14-17`）；模板里 PascalCase / kebab-case 都能用。
- **`name` 必须与路由 `name` 一致**：`KeepAlive` 的 `include` 取的是路由 name（`web/src/store/modules/tagsView.js:15-19`、`web/src/layout/components/AppMain.vue:4`），组件 `name` 与之不匹配时页面缓存静默失效。
  存量反例（不要模仿）：路由 `name: 'Channel'`（`web/src/router/index.js:82`）对应组件却叫 `ChannelList`（`web/src/views/channel/index.vue:193`）。
- 存量反例（不要模仿）：
  - `web/src/views/common/GroupTree.vue:129` 与 `web/src/views/common/RegionTree.vue:124` 都叫 `name: 'DeviceTree'`；
  - `web/src/views/device/list.vue:186` 叫 `name: 'App'`，与根组件 `App.vue` 撞名；
  - `web/src/components/Breadcrumb/index.vue` 等 8 个文件没写 `name`。
  重名会让 Vue devtools / keep-alive 命中错误组件，新组件必须唯一。

### 事件（`$emit`）

- 事件名现状 camelCase 33 处、kebab-case 38 处。**新代码统一 kebab-case**（与 Vue 官方风格一致）；Vue 2 **不会**自动做大小写转换，emit 名与监听名必须逐字一致。
- 子组件透传父级事件用 `$emit` 直接转发，不包一层同名函数（`views/channel/common/channelPtzPanel.vue:11-12`）。
- 需要「父组件可选监听某个事件」时，用 `$listeners` 判断，而不是加 `xxxEnabled` prop（`views/common/ptzControls.vue:84`）：

```js
hasDragZoom() { return 'toggle-drag-zoom' in this.$listeners || 'toggle-drag-zoom-out' in this.$listeners },
```

---

## Props Conventions

- **新代码必须用对象写法**：`type` + `default`（必填项用 `required: true`）。示例 `views/common/DeviceTree.vue:53-72`：

```js
props: {
  device: { type: Object, default: () => ({}) },   // 数组/对象 default 必须是工厂函数
  onlyCatalog: { type: Boolean, default: false },
  contextMenuEvent: { type: Function, default: null }
}
```

- 数组写法 `props: ['videoUrl', 'hasAudio', ...]`（`views/common/jessibuca.vue:39`）全库还有 24 处，**属于存量，不要模仿**：没有类型校验、没有默认值，`undefined` 会直接进渲染。
- `required: true` 只给真正不可或缺的 prop，例如 `web/src/components/SvgIcon/index.vue:15-20` 的 `iconClass`。
- 空声明 `props: {}` / `props: []` 全库 45 处（如 `views/cloudRecord/playerDialog.vue:30`）。新代码**直接省略 `props` 字段**，不要留空壳。
- **禁止在子组件里改 prop**。存量反例（不要模仿）：`views/platform/edit.vue:151` 声明 `props: ['value', ...]`，模板里 `v-model="value.name"`（同文件 `:8-43`）直接改父级对象。
  需要双向绑定时，用 `model` 选项 + 事件显式回传，参考 `views/jtDevice/deviceParam/alarmSign.vue:43-56`：

```js
model: { prop: 'fatherValue', event: 'change' },
props: { fatherValue: { type: Object, default: null } },
// change() 里 this.$emit('change', this.form)
```

  注意存量调用方不是用 `v-model`，而是 `:fatherValue="..." @change="(data)=>{...}"`（`views/jtDevice/deviceParam/alarm.vue:6`），保持与现状一致即可。
- Element UI 弹窗一律 `:visible.sync="showDialog"` 控制显隐（全库 `:visible.sync` 共 58 处，其中 48 处绑定 `showDialog`，如 `views/device/edit.vue:9`；其余为 `showVideoDialog`、`playbackDialogVisible` 等），不要给 el-dialog 套 `v-model`；自定义组件的双向绑定见上一条 `model` 用法。

---

## Styling Patterns

- 每组件自带 `<style>`；**优先 `scoped`**：现状 `scoped` 44 个文件、无 `scoped` 37 个文件。无 `scoped` 的存量文件（如 `views/common/DeviceTree.vue`）属于历史，新组件必须加 `scoped`。
- 默认写普通 CSS；需要嵌套/变量才用 `lang="scss"`（现有 12 处，如 `views/user/forceChangePassword.vue`）。全局变量在 `web/src/styles/variables.scss`，SCSS 中手动 `@import "~@/styles/variables.scss"`（`layout/index.vue:57`）。
- 覆盖 Element UI 内部样式用深度选择器，现有两种写法：
  - `>>>`：`views/common/playerTabs.vue:177` `.player-tabs-wrapper .el-tabs >>> .el-tabs__header`；
  - `::v-deep`：`layout/components/TagsView/ScrollPane.vue:85`。
  普通 CSS 用 `>>>`，SCSS 用 `::v-deep`，不要在 `scoped` 里写裸 `.el-xxx`（不会生效）。
- 全局样式只在 `web/src/styles/index.scss` 增量添加；页面根节点统一加 `class="app-container"`（内边距 20px，`styles/index.scss:64`），例如 `views/alarm/index.vue:2`。
- 单个元素的一次性布局用行内 `style` 是既有常态（`views/channel/index.vue:2`），但可复用的规则不要写成行内。

### Element UI 既有模板（直接照抄）

表格：`size="small"` + `header-row-class-name="table-header"` + 具名插槽 `v-slot:default="scope"`（全库 `template v-slot:default` 86 处，`slot-scope` 仅 9 处存量）：

```html
<el-table ref="channelListTable" size="small" :data="channelList"
          height="calc(100% - 64px)" header-row-class-name="table-header"
          @selection-change="handleSelectionChange">
  <el-table-column type="selection" width="55" />
  <el-table-column prop="gbDeviceId" label="编号" min-width="180" />
  <el-table-column label="操作" min-width="210" fixed="right">
    <template v-slot:default="scope">
      <el-button size="medium" type="text" @click="handleEdit(scope.row)">编辑</el-button>
    </template>
  </el-table-column>
</el-table>
```

（来自 `web/src/views/channel/index.vue:73-82,112-140`；刷新数据后需 `this.$refs.xxxTable.doLayout()`，`views/alarm/index.vue:276`）

弹窗 + 表单 + 校验：组件自身持有 `showDialog`，对外只暴露 `openDialog(...)`，父组件通过 `$refs` 调用：

```html
<el-dialog v-el-drag-dialog title="设备编辑" width="40%" top="2rem"
           :close-on-click-modal="false" :visible.sync="showDialog"
           :destroy-on-close="true" @close="close()">
  <el-form ref="form" :rules="rules" :model="form" label-width="100px"> ... </el-form>
</el-dialog>
```

```js
import elDragDialog from '@/directive/el-drag-dialog'
export default {
  name: 'DeviceEdit',
  directives: { elDragDialog },
  data() {
    return { showDialog: false, rules: { deviceId: [{ required: true, message: '请输入设备编号', trigger: 'blur' }] } }
  },
  methods: {
    openDialog(row, callback) { this.showDialog = true; /* ... */ },
    onSubmit() { this.$refs.form.validate(valid => { if (valid) { /* dispatch */ } }) },
    close() { this.showDialog = false; this.$refs.form.resetFields() }
  }
}
```

（来自 `web/src/views/device/edit.vue:3-67,72-134`；父级调用见 `layout/components/Navbar.vue:55`）
表单校验统一 `this.$refs.xxxForm.validate(valid => ...)`（`layout/components/dialog/changePassword.vue:99`），不要手写逐字段判断。

---

## Accessibility

- 项目**没有系统化的无障碍规范**，也没有 `a11y` 插件或 lint 规则（`.eslintrc.js` 未启用 `plugin:vue/a11y`）。不要声称存在。
- 既有做法只有两点，新组件请沿用：
  - 纯图标按钮/可点击 `<i>` 尽量加 `title` 说明用途（`web/src` 中静态 `title="..."` 约 180 处，如 `views/live/index.vue:10`、`views/common/ptzControls.vue:14`）。现状并不统一，纯图标无 `title` 的也存在（如 `views/live/index.vue:58`），新组件补齐即可；
  - 装饰性 SVG 加 `aria-hidden="true"`（`web/src/components/SvgIcon/index.vue:3`）。
- 原生 `<button>` / `<el-button>` 优先于可点击 `<div>`；`views/common/ptzControls.vue:14` 的裸 `<button>` 属于少量特例。

---

## Common Mistakes

1. **写 Vue 3 语法**：`<script setup>`、`ref()`、`defineComponent` 在本项目无法编译，也别为了「新写法」升级 Vue。
2. **组件 `name` 与路由 `name` 不一致**，页面缓存（tagsView）失效且无报错。见上文 `Channel` / `ChannelList`。
3. **`props` 用数组、改 prop、留空 `props: {}`**：分别见 `views/common/jessibuca.vue:39`、`views/platform/edit.vue:8-43`、`views/cloudRecord/playerDialog.vue:30`。
4. **引用不存在的全局 getter**：`web/src/views/channel/index.vue:137` 用了 `$store.getters.authority`，但 `web/src/store/getters.js` 里没有 `authority`（只有 `roleId` 等）。存量代码里这行永远为 `true`，不要照抄；权限判断请用 `roleId`（`layout/components/Sidebar/index.vue:39`）。
   项目**没有** `v-permission` / `v-hasPermi` 之类的权限指令，`web/src/directive/` 下只有 `el-drag-dialog`。
5. **在组件里直接发请求**：`views/dialog/channelMapInfobox.vue:45`、`views/dialog/commonChannelEditDialog.vue:48`、`views/map/queryTrace.vue:77`、`views/operations/historyLog.vue:205` 用了 `this.$axios`，但 `main.js` 只注册了 `Vue.prototype.$channelTypeList`（`web/src/main.js:42`），没有 `$axios`。这是存量坏味道，新代码一律走 `store.dispatch` → `@/api/*.js`。
6. **`v-el-drag-dialog` 忘记注册**：共 50 处使用，必须同时 `import elDragDialog from '@/directive/el-drag-dialog'` 并 `directives: { elDragDialog }`（示例 `views/cloudRecord/playerDialog.vue:23-29`）。少写 import 会在运行时报指令未定义。
7. **遗留 `console.log`**：全库 235 处（`.vue` 226 处 + `.js` 9 处），含 `mixins/dragZoom.js` 6 处调试输出。`.eslintrc.js` 里 `no-console` 生产环境仅 `warn`，不会拦住；新代码不要新增，调试完删除。
8. **mixin 只用于跨组件复用播放器逻辑**：现有唯一公共 mixin 是 `web/src/mixins/dragZoom.js`，被 `jessibuca.vue` / `rtcPlayer.vue` / `h265web.vue` 复用，且要求宿主实现 `getVideoRect()`（三处均有实现，如 `views/common/jessibuca.vue:289`）。除此之外不要新造 mixin/eventBus——全库没有 `$bus`、没有 `provide/inject`。
