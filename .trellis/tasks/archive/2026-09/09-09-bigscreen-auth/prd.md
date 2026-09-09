# PRD：大屏账号密码登录

## 背景

大屏（visual/）此前通过 `.env` 里的 `VITE_API_KEY` 以 api-key 请求头直连 WVP 后端。用户要求移除 api-key 方式，改用 WVP 平台账号密码登录访问。

## 需求

1. 登录页：账号密码表单，提交到 `POST /api/user/login`（密码前端 md5 32 位，与源码前端一致），成功取 `accessToken`（JWT）
2. 认证方式：所有接口请求头改为 `access-token: <JWT>`（替代 api-key）
3. 会话管理：token 存 sessionStorage，刷新页面保持登录，关浏览器失效；登录成功后启动数据轮询
4. 401 过期：任何接口返回 401（HTTP 状态或业务 code=401"请登录后重新请求"）时清空凭证并回到登录页
5. 移除 `VITE_API_KEY` 配置与 `.env` 中的 key（`API_BASE_URL` 保留）

## 验收标准

1. 打开页面显示登录页（深色大屏风格），未登录不发起业务请求
2. 输入 WVP 账号密码登录成功 → 进入大屏，数据正常加载
3. 错误密码显示后端错误消息（"用户名或密码错误"）
4. 登录后刷新页面保持登录态（sessionStorage）
5. token 失效（后端重启/过期）后任一请求 401 → 自动回登录页
6. `pnpm build`（vue-tsc 严格检查）通过
7. 对讲推流的 `sign=pushKey`（getUserInfo）不受影响

## 非目标

- 不做"记住我"（localStorage 长期凭证）
- 不做大屏内修改密码/用户管理（用 WVP 源码前端管理）
- 不改后端代码

## 技术方案（已分析确认）

- 源码登录链路：`web/src/api/user.js login()` → md5 密码 → `POST /api/user/login` → `data.accessToken`；后续请求 `access-token` 头（`JwtAuthenticationFilter` 三种凭证等价）
- md5 用 `spark-md5`（浏览器原生 crypto.subtle 不支持 MD5）
- 改动文件：`src/api/client.ts`（认证头+401）、`src/stores/useAuth.ts`（新）、`src/components/LoginPage.vue`（新）、`src/App.vue`（登录门禁）、`src/config/env.ts` + `vite-env.d.ts`（移除 key）
