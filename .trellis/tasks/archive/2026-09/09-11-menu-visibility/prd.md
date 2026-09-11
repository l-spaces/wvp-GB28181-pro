# 菜单显示权限控制（非管理员白名单）

## Goal

admin（roleId==1）登录 web 显示全部菜单；非管理员用户只显示固定白名单菜单（控制台、分屏监控、通道列表、电子地图、云端录像）。纯前端最小改动，与已有通道数据过滤（archive/09-09-user-channel-assign）配合，提升非管理员界面聚焦度。

## 背景与确认事实（代码探查）

- 菜单全部定义在 `web/src/router/index.js` 的 `constantRoutes`，所有角色无差别可访问；路由 `meta` 无 `roles` 字段，项目未用 vue-element-admin 的 `asyncRoutes`+`permission.js` 动态路由。
- 菜单渲染：`web/src/layout/components/Sidebar/index.vue:33` 的 `routes()` computed 直接 `return this.$router.options.routes`，无过滤。
- 前端未存当前用户 `roleId`：`store/getters.js` 仅 `token/name/defaultPassword/serverId`；`store/modules/user.js` 的 `login` 未存 `role`。持久化统一走 `@/utils/auth` 的 `getX/setX/removeX`（cookie），state 用 `getToken()` 等初始化（刷新后从 cookie 恢复）。
- 登录响应 `POST /api/user/login` 返回 `LoginUser`，含 `role.id`（admin 为 1）。
- `constantRoutes` 顶级项 path：`/`（控制台，redirect `/dashboard`）、`/live`、`/channel`、`/map`、`/device`、`/commonChannel`、`/alarm`、`/recordPlan`、`/cloudRecord`、`/mediaServer`、`/platform`、`/user`、`/operations`，及 `hidden:true` 的 `/login`、`/404` 等。

## 需求

- R1：admin（roleId==1）侧边栏显示全部菜单，与改动前完全一致（回归）。
- R2：非管理员用户侧边栏只显示白名单菜单，非白名单项隐藏。
- R3：前端登录时落地 `roleId` 并持久化（cookie），刷新后可恢复，Sidebar 可读。
- R4：`roleId` 缺失（异常态）按**非管理员**处理（保守，只显示白名单）；正常登录/刷新流程 `roleId` 恒可得，管理员不受影响。

## 白名单（非管理员可见，顶级 route path）

| 菜单 | 顶级 path |
|------|-----------|
| 控制台 | `/`（redirect `/dashboard`） |
| 分屏监控 | `/live` |
| 通道列表 | `/channel` |
| 电子地图 | `/map` |
| 云端录像 | `/cloudRecord` |

> 注意：控制台的顶级 route path 是 `/`（非 `/dashboard`），白名单匹配须用 `/`。

## 技术注记（实现落点，4 处）

1. `web/src/utils/auth.js`：新增 `getRole/setRole/removeRole`（照 `token`/`name` 的 cookie 模式）。
2. `web/src/store/modules/user.js`：state 加 `roleId: getRole()`；`login` 成功时 `commit SET_ROLE` + `setRole(data.role && data.role.id)`；`logout`/`resetToken` 时 `removeRole` + RESET。
3. `web/src/store/getters.js`：新增 `roleId: state => state.user.roleId`。
4. `web/src/layout/components/Sidebar/index.vue`：`routes()` computed 内，读 `roleId`；`roleId==1` 返回全部；否则按白名单 path 集合 `filter` 顶级 route（保留 `hidden` 逻辑不变，仅过滤可见顶级项）。白名单建议定义为文件内常量。

## 验收标准

- [ ] admin 登录 → 侧边栏 13 项菜单全部显示（回归不变）。
- [ ] 非管理员（如 test1）登录 → 侧边栏只显示控制台/分屏监控/通道列表/电子地图/云端录像 5 项。
- [ ] 刷新页面后过滤仍生效（roleId 从 cookie 恢复），admin 与非管理员均正确。
- [ ] 白名单页面功能正常（可进入，数据受通道过滤）。
- [ ] `npm run build:prod` 通过。

## 范围外

- 不做按角色/按用户的菜单配置（本期统一白名单）。
- 不加路由守卫 / URL 直达拦截（数据层已由通道过滤保护）。
- 不改后端菜单权限模型、不新增表。
- 不动 visual/ 大屏。
