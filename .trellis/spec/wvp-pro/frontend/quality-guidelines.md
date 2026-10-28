# Quality Guidelines

> 前端（`web/`，Vue 2.6.10 + Element UI 2.15）质量规范：ESLint 实际规则、禁止/必须模式、测试现状、构建与评审清单。
> 来源：`doc/编程规范.md` 第十四、十五节，按本主题拆解，并补充从配置文件核实到的事实。
> 原则：**新代码必须遵守，存量代码逐步靠拢**；标注的存量反例是历史遗留，不要照抄。

---

## Overview

- 工具链固定：`vue-cli-service` 4.4.4、ESLint 6.7.2、Jest 24.9.0、Node 20+（`.github/workflows/build.yml` 用 `node-version: '20.x'`）。
- **ESLint 不参与构建**：`web/vue.config.js:29` 是 `lintOnSave: false`，dev server 的 overlay 也把 errors 关掉（`web/vue.config.js:37-40`）。所以 `npm run lint` 是唯一门禁，构建通过 ≠ 代码合规。
- **没有 git hook 强制**：仓库没有 husky / lint-staged（`web/package.json` 无相关依赖），`.git/hooks` 只有 `.sample`。门禁靠自觉和评审。
- 现状是**带病运行**：完整跑一次 `npm run lint` 得到 6 errors + 711 warnings（本机实测，退出码 1），所以“lint 必须全绿”不能作为提交前提，只要求**不新增问题**。
- 规模：`web/src/views` 下 162 个 `.vue` 页面，`web/src` 共 297 个文件；单元测试只覆盖 3 个基础组件和 4 个工具函数。

---

## Forbidden Patterns

**1. 新增 ESLint error（当前已有 6 个，不要加到 7 个）**

```bash
cd web && npm run lint   # eslint --ext .js,.vue src
```

真实存量 error（不要模仿）：`web/src/utils/auth.js:51` `no-extra-boolean-cast`、`web/src/views/user/forceChangePassword.vue:86` 与 `web/src/directive/el-drag-dialog/drag.js:39-40` `no-useless-escape`、`web/src/views/common/MapComponent_bak.vue:606,608` `no-empty`。
warning 数量前几名：`no-unused-vars` 458、`quotes` 111、`object-curly-spacing` 36、`semi` 32、`eqeqeq` 28——新代码不要继续增加。

**2. 在页面里直接 `import axios` 或使用未注册的 `this.$axios`**

全仓 `import axios` 只应出现在 `web/src/utils/request.js:1`（实测：vue/js 文件中仅此一处）。
存量反例（不要模仿）：`web/src/views/operations/historyLog.vue:205`、`web/src/views/dialog/recordDownload.vue:171`、`web/src/views/map/queryTrace.vue:77`、`web/src/views/dialog/channelMapInfobox.vue:45` 使用 `this.$axios`，但项目**从未注册** `Vue.prototype.$axios`（`web/src/main.js` 只有 `Vue.prototype.$channelTypeList`，全仓 grep 无 `$axios =` 赋值，`web/public/static/js` 里也没有挂 `window.axios`）。按静态代码判断这些调用会在运行时报 `this.$axios is not a function`（未做运行时实测）；`historyLog` 还是已注册路由（`web/src/router/index.js:283-287`）。新代码不要复制这种写法。

**3. 在 console 输出敏感对象**

`pushKey` 是推流鉴权密钥，`web/src/views/user/index.vue:23` 会把它渲染到列表里。

```js
// 错（存量反例，web/src/views/user/dialog/changePasswordForAdmin.vue:96 与 changePushKey.vue:63）
console.log(row)   // row 含 username/pushKey

// 对：只打 id 之类无敏感信息的字段，或直接删掉
```
全仓 `console.log` 有 235 处，属于待清理噪音；`no-console` 只在 production 是 `warn`、development 是 `off`（`web/.eslintrc.js:40`），别指望 lint 拦住。

**4. 生产构建新增 mock 接口**

`web/src/main.js:30-33` 在 `NODE_ENV === 'production'` 时 `require('../mock')` 并执行 `mockXHR()`，即**当前 mock 会进入生产包**（mock 地址是 `/vue-admin-template/*`：`web/mock/user.js:29,52,75`、`web/mock/table.js:16`，与 `/api` 不冲突）。规则：不要新增 mock 条目，更不要把 mock 地址改成 `/api/**`，否则会劫持真实接口。

**5. 新增依赖前不确认**

`web/node_modules` 已装 `echarts 4`、`ol 10`、`xlsx`、`gcoord`、`dayjs`、`moment`、`v-charts`。能用已有依赖就不要加新包（`doc/编程规范.md` §15 一个提交只做一件事）。

---

## Required Patterns

**1. 接口统一走 `web/src/api/*.js` + `@/utils/request`**

```js
// web/src/api/device.js:1-13 —— 现存风格，照此写
import request from '@/utils/request'

export function queryDeviceSyncStatus(deviceId) {
  return request({ method: 'get', url: `/api/device/query/sync_status`, params: { deviceId } })
}
```
22 个 `web/src/api/*.js` 全部这样写。页面通过 Vuex action 调用：`web/src/views/device/list.vue:238-245` `this.$store.dispatch('device/queryDevices', {...}).then(data => ...)`，action 内部 `const { data } = response; resolve(data)`（`web/src/store/modules/device.js:40-48`；同文件 `:30-37` 的 `resolve(response)` 是唯一的分叉写法，新代码不要学）。

存量反例：`web/src/views/operations/showLog.vue:20` 和 `web/src/views/device/dialog/timeStatistics.vue:60` 直接 `import request from '@/utils/request'`，绕过了 api 层。

**2. 响应结构以 `request.js` 的实际解包为准**

`web/src/utils/request.js:43-53` 已经 `const res = response.data` 并返回 `res`，所以调用方拿到的是 `WVPResult` 本体：

```js
// 正确：res.code / res.data / res.msg
queryDevices(params).then(res => { if (res.code === 0) use(res.data) })

// 错误：多解一层，拿到 undefined
res.data.code
```
注意 `doc/编程规范.md` §14 写的 `res.data.code / res.data.data / res.data.msg` 与上述实现不一致，**以 `web/src/utils/request.js` 为准**。
`request.js:48-50` 在 `res.code !== 0` 时 `throw res.msg`（抛出的是字符串不是 Error），所以页面 `.catch(error => this.$message({message: error, ...}))` 是现有惯例（`web/src/views/device/list.vue:248-253`）。
统一拦截器已处理：`access-token` 请求头注入（`:19-21`，登录接口除外）、超时 30s（`:12`）、401 重登录确认框（`:56-77`）。页面不要再写重复的鉴权/超时逻辑。

**3. 代码风格按 `.eslintrc.js` 的真实配置**

`extends: ["plugin:vue/essential", "eslint:recommended"]`，parser 是 `babel-eslint`（`web/.eslintrc.js:7-10`）。风格类规则全部是 `warn`，关键几条：`quotes: single`、`semi: never`（不加分号）、`object-curly-spacing: always`、`comma-dangle: never`、`eqeqeq`、`no-multi-spaces`。缩进以 `web/.editorconfig` 为准（2 空格、LF、UTF-8、行尾不留空格）。
被显式关闭的：`vue/require-prop-types`、`vue/require-default-prop`、`vue/attributes-order`、`vue/html-self-closing`、`vue/this-in-template`。
`ZLMRTCClient`、`jessibuca` 声明为全局只读（`web/.eslintrc.js:43-47`），它们由 `web/public/index.html:11-13` 的 script 标签加载。

**4. dev 代理与端口按 `vue.config.js` 使用**

- 前端 dev 端口 9528：`web/vue.config.js:15`，可用 `port=xxxx npm run dev` 覆盖；`npm run dev` 额外加 `--host=0.0.0.0`（`web/package.json:7`）。
- `/dev-api` → `http://127.0.0.1:18080`，并 `pathRewrite` 去掉前缀（`web/vue.config.js:43-49`）；`/static/snap` 直连同一后端（`:50-56`）。
- `VUE_APP_BASE_API`：开发 `/dev-api`（`web/.env.development:5`），生产空串（`web/.env.production:5`）——即生产与后端同源部署，新增接口路径不要硬编码主机名。
- 后端 18080 来自 `src/main/resources/application-dev.yml:53`。

**5. 构建产物不进版本库**

`npm run build:prod` = `vue-cli-service build`（`web/package.json:8`），输出 `../src/main/resources/static`（`web/vue.config.js:27`）、静态资源子目录 `static`（`:28`）、不生成 sourcemap（`:30`）。该目录被根 `.gitignore:29` 忽略（`git check-ignore` 已验证）。不要手工提交构建产物，也不要改 `outputDir`。
本地能成功构建不代表能上线：`mvn package` 不会构建前端（AGENTS.md），发布靠 `.github/workflows/build.yml` 里的 `npm install && npm run build:prod`，只在 `v*.*.*` tag 触发。

---

## Testing Requirements

**策略：纯单元测试，不启动浏览器、不连后端。**

- 跑法：`cd web && npm run test:unit`（`jest --clearCache && vue-cli-service test:unit`，`web/package.json:13`）；`npm run test:ci` 是 lint + test（`:14`）。注意 `package.json` **没有 `test` 脚本**，而 `web/.travis.yml` 写的是 `npm run test`，该 CI 配置已失效，别参考。
- 配置在 `web/jest.config.js`：`testMatch` 为 `**/tests/unit/**/*.spec.js` 或 `**/__tests__/*`（`:13-15`），`@/` 映射到 `src/`（`:9-11`），`.vue` 走 `vue-jest`，样式/图片走 `jest-transform-stub`。
- 覆盖率默认**不开启**（`web/jest.config.js:18` 的 `'collectCoverage': true` 是注释），`collectCoverageFrom` 只统计 `src/utils/**`（排除 `auth.js`、`request.js`）和 `src/components/**`，报告目录 `tests/unit/coverage`（被 `web/.gitignore:8` 忽略，当前不存在）。**没有覆盖率基线，不要声称有覆盖率要求。**
- 现状：7 个 spec、28 个用例（`web/tests/unit/`）。已覆盖 `components/Breadcrumb|Hamburger|SvgIcon` 和 `utils/formatTime|param2Obj|parseTime|validate`。**162 个 views 页面、22 个 api 模块、24 个 store module 全部无测试**——新建页面不要指望有现成的测试脚手架可复制。
- **现在跑是红的**：`npm run test:unit` 退出码 1，`web/tests/unit/utils/validate.spec.js:7` 期望 `validUsername('xxxx') === false`，而 `web/src/utils/validate.js:17-19` 实现是 `return str.length >= 0`（恒真）。要么修实现，要么改断言，不要把它当成“测试本来就这样”。
- 新增测试要求：
  - 文件放 `web/tests/unit/{components,utils}/`，命名 `*.spec.js`；
  - 有逻辑的工具函数（格式化、参数解析、权限判断、校验）必须有测试，参考 `web/tests/unit/utils/parseTime.spec.js` 的多分支写法；
  - 测试文件继承 `web/tests/unit/.eslintrc.js` 的 `env: { jest: true }`，不要在每个文件写 `/* global describe */`；
  - 修前端 bug 补一条能复现的回归用例（`doc/编程规范.md` §13）。

---

## Code Review Checklist

1. `cd web && npm run lint` 是否新增 error/warning？只允许减少，不允许增加。
2. 新接口是否落在 `web/src/api/*.js` 并复用 `@/utils/request`？页面里有没有新的 `import axios` / `this.$axios`？
3. 响应取值是否是 `res.code` / `res.data`（单层解包），没有多余的 `res.data.code`？
4. 是否新增 `console.log`？有没有打印 `token` / `password` / `pushKey` / 整个 row？
5. 是否新增 mock 条目（`web/mock/`），或改动 `src/main.js:30-33` 的生产 mock 逻辑？
6. 新增/修改的工具函数是否有 `web/tests/unit/**/*.spec.js` 覆盖？测试能跑通吗（注意现存 1 个红用例）？
7. 是否改动 `web/vue.config.js` 的 `outputDir`、代理 target、端口？改代理要同步确认后端端口。
8. 是否引入新依赖？能否用已有依赖（`echarts@4`、`ol@10`、`xlsx`、`dayjs`/`moment`）替代？
9. 构建产物（`src/main/resources/static/`）是否被误加入暂存区？
10. 提交信息中文、动词开头、一个提交一件事（`doc/编程规范.md` §15）。
