# 前端开发规范

> WVP-Pro 前端（Vue 2 + Element UI，`web/`）的编码约定。
> 本目录是 `doc/编程规范.md` 第十四节按主题拆解后的可执行版本，所有结论以当前代码库实际状态为准。

---

## Overview

`web/src/` 共 177 个 `.vue` 文件，22 个 api 模块，约 20 个 Vuex module，19 个 views 目录。
构建 `npm run build:prod` 输出到 `src/main/resources/static`（被 gitignore）。
**项目不使用 TypeScript，也没有 Vue 3 Composition API** —— 详见 Type Safety 与 Hook Guidelines。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 目录组织、api/store/views 落点、新增页面的端到端文件清单 | Active |
| [Component Guidelines](./component-guidelines.md) | Vue 2 Options API、props 声明、Element UI 表格/表单/弹窗模板 | Active |
| [Hook Guidelines](./hook-guidelines.md) | 本项目无 Vue 3 Hooks；用 mixins + 生命周期 + utils 承担复用 | Active |
| [State Management](./state-management.md) | 组件 data / Vuex module / 后端三级状态的选择与 token 存储 | Active |
| [Quality Guidelines](./quality-guidelines.md) | ESLint 真实规则、构建命令、axios 封装、测试现状 | Active |
| [Type Safety](./type-safety.md) | 无 TS 的类型兜底：props 契约、表单校验、响应解构纪律 | Active |

---

## 使用方式

1. **动手前**读对应主题的规范，不要只看文件名猜内容。
2. 每篇都标了真实文件与行号，可直接跳转核对。
3. 模板标题里的 "hooks" 是上游模板残留，本项目真实对应物见 Hook Guidelines。
4. 发现规范与代码不一致时，以代码为准并更新规范。

---

**Language**: 中文（技术术语、组件名、配置项保持原文）。
