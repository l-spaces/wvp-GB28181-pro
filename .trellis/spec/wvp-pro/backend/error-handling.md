# Error Handling

> 本项目错误处理与返回约定的**实际契约**（不是理想化规范）。来源：`doc/编程规范.md` 第四/五/七/八节 + 代码逐条核对。
> 适用范围：`src/main/java/com/genersoft/iot/vmp/`。新代码遵守，存量代码逐步靠拢。

---

## Overview

**本项目的唯一约定：业务错误 = HTTP 200 + `WVPResult.code != 0`；只有协议级错误才改 HTTP 状态码。**

前端只认 `code`，不认 HTTP 状态：`web/src/utils/request.js:48` 的 `if (res.code && res.code !== 0) throw res.msg`。

| 场景 | 出口 | 错误载体 |
|---|---|---|
| 同步 REST 接口 | `conf/GlobalResponseAdvice` 自动包 `WVPResult` | `ControllerException` + `ErrorCode` |
| 点播/回放/下载等异步等待 | `DeferredResult` / `ErrorCallback` | `InviteErrorCode` |
| 定时任务、SIP 事件线程等无 HTTP 请求的路径 | 日志 + 状态清理 | 不向上抛异常 |

细节进日志，短消息进 `msg`。SQL、文件路径、密钥、堆栈**不得**拼进返回给前端的 message（见 Common Mistakes）。

---

## Error Types

### 异常类（`conf/exception/`）

| 类 | 类型 | 现状 |
|---|---|---|
| `ControllerException` | `RuntimeException`，带 `int code` + `String msg` | **新增代码统一用这个**。构造器 `(int, String)` 与 `(ErrorCode)` |
| `ServiceException` | 受检 `Exception` | 只有 `playbackPause/playbackResume` 用（`gb28181/service/IPlayService.java:51,53`），Controller 捕获后转 `ControllerException`（`gb28181/controller/PlaybackController.java:170-173`）。**存量模式，不要模仿** |
| `SsrcTransactionNotFoundException` | 受检 `Exception` | SIP 事务缺失，`getMessage()` 会拼 device/channel/callId/stream |

### 两套错误码，禁止混用

- `ErrorCode`（`vmanager/bean/ErrorCode.java:7-16`，HTTP/业务码）：
  `SUCCESS(0)`、`ERROR100(100,"失败")`、`ERROR400(400,"参数或方法错误")`、`ERROR401(401,"请登录后重新请求")`、`ERROR403(403,"无权限操作")`、`ERROR404(404,"资源未找到")`、`ERROR408(408)`、`ERROR429(429,"请求过多")`、`ERROR486(486,"超时或无响应")`、`ERROR500(500,"系统异常")`。
- `InviteErrorCode`（`service/bean/InviteErrorCode.java:7-24`，异步点播码，全部为 0 或负数）：
  `SUCCESS(0)`、`ERROR_FOR_SIGNALLING_TIMEOUT(-1)`、`ERROR_FOR_STREAM_TIMEOUT(-2)`、`ERROR_FOR_RESOURCE_EXHAUSTION(-3)`、`ERROR_FOR_CATCH_DATA(-4)`、`ERROR_FOR_SIGNALLING_ERROR(-5)`、`ERROR_FOR_STREAM_PARSING_EXCEPTIONS(-6)`、`ERROR_FOR_SDP_PARSING_EXCEPTIONS(-7)`、`ERROR_FOR_SSRC_UNAVAILABLE(-8)`、`ERROR_FOR_RESET_SSRC(-9)`、`ERROR_FOR_SIP_SENDING_FAILED(-10)`、`ERROR_FOR_ASSIST_NOT_READY(-11)`、`ERROR_FOR_PARAMETER_ERROR(-13)`、`ERROR_FOR_TCP_ACTIVE_CONNECTION_REFUSED_ERROR(-14)`、`ERROR_FOR_INVITE_TIMEOUT(-15,"点播等待超时")`、`ERROR_FOR_FINISH(-20)`、`FAIL(-100)`。

### 回调接口

- `ErrorCallback<T>`：`void run(int code, String msg, T data)`（`service/bean/ErrorCallback.java:5`），点播/回放/云台异步结果用它。
- `CommonCallback<T>`：`void run(T t)`（`common/CommonCallback.java:3-5`），无错误码语义。
- `MessageEvent<T>` 内部持有 `ErrorCallback<T>`，超时时 `run(ErrorCode.ERROR486.getCode(), "消息超时未回复", null)`（`gb28181/event/MessageSubscribe.java:31`）——这是**存量混用**：`ErrorCallback` 里塞了 `ErrorCode` 的值。

---

## Error Handling Patterns

### 1. Controller / Service：抛异常，不手工拼 `WVPResult`

```java
// 推荐：带错误码
throw new ControllerException(ErrorCode.ERROR403);                               // vmanager/user/UserChannelController.java:41
throw new ControllerException(ErrorCode.ERROR100.getCode(), "未找到可用的zlm");   // gb28181/service/impl/PlayServiceImpl.java:361

// 推荐：入参校验用 Spring Assert，走 IllegalArgumentException → ERROR100
Assert.notNull(device, "设备不存在");                                             // gb28181/controller/PlayController.java:92
```

`Assert.notNull` 抛 `IllegalArgumentException`，由全局处理器映射成 `ERROR100` + 原断言消息（`conf/GlobalExceptionHandler.java:84-88`）。Service 层也可以直接抛 `ControllerException`（`service/impl/CloudRecordSessionServiceImpl.java:83-101` 抛了 `ERROR404/ERROR400/ERROR486/ERROR429`）。

### 2. 全局异常映射（`conf/GlobalExceptionHandler.java`，精确取值）

| 异常 | HTTP | `WVPResult.code` | `msg` | 行号 |
|---|---|---|---|---|
| `ControllerException` | **200** | `e.getCode()` | `e.getMsg()` | 96-100 |
| `IllegalArgumentException` | **200** | `ERROR100` = 100 | `e.getMessage()` | 84-88 |
| `IllegalStateException` | 400 | `ERROR400` = 400 | "参数或方法错误" | 63-67 |
| `HttpRequestMethodNotSupportedException` | 400 | `ERROR400` = 400 | "参数或方法错误" | 74-78 |
| `MaxUploadSizeExceededException` | 403 | `ERROR403` = 403 | "文件过大" | 41-45 |
| `NoResourceFoundException` | 404 | `ERROR404` = 404 | "资源未找到" | 52-56 |
| `BadCredentialsException` | 返回值 `ResponseEntity(..., HttpStatus.OK)` | `ERROR100` = 100 | "认证失败" | 107-111 |
| 其它 `Exception` | 500 | `ERROR500` = 500 | `e.getMessage()`（**反例**） | 29-34 |

### 3. 自动包装与排除路径（`conf/GlobalResponseAdvice.java:32-66`）

`beforeBodyWrite` 的实际顺序：

1. `excludePath = {"/v3/api-docs", "/api/v1", "/index/hook", "/api/video-"}`，`startsWith` 命中则原样返回（34-39）；
2. `application/x-protobuf` 原样返回（41-43）；
3. `body instanceof WVPResult` 原样返回（45-47）；
4. `body instanceof ErrorCode` → 转成 `WVPResult(code, msg, null)`（49-52）；
5. `body instanceof String` → `JSON.toJSONString(WVPResult.success(body))`（54-56）；
6. `LinkedHashMap` 且 `status != 200` → 原样返回（58-63）；
7. 其余 → `WVPResult.success(body)`（65）。

要点：

- 排除的是**包装**，不是**异常处理**。`GlobalExceptionHandler` 标的是裸 `@RestControllerAdvice`（无 `basePackages` 限制），所以 `/api/v1` 接口抛 `ControllerException` 仍然返回 `WVPResult` 形状。兼容接口必须自己保证错误外形。
- `/api/v1` 对应 `web/gb28181/ApiController.java:18`、`ApiStreamController.java:36`、`ApiDeviceController.java:34`、`ApiControlController.java:25`；`/index/hook` 对应 `media/zlm/ZLMHttpHookListener.java:40`、`media/abl/ABLHttpHookListener.java:41`。
- `/api/video-` 前缀在当前后端**没有对应 Controller**（全仓仅此排除列表出现），属历史兼容，新增接口不要占用。
- `/api/v1/*` 的错误是原始 JSON，例如 `{"error": "device[ xxx ]未找到"}`（`web/gb28181/ApiStreamController.java:86-108`），不是 `WVPResult`。
- 当前未发现 Controller 直接返回 `ErrorCode`（`instanceof ErrorCode` 只出现在 advice 里），新代码不要依赖第 4 条分支。

### 4. 异步回调：`onceAndFirst` 认领 + 恰好一次通知

```java
// 原子认领：只有返回 true 的线程发起 SIP，其余等待结果
boolean first = inviteStreamService.onceAndFirst(InviteSessionType.PLAY, channel.getId(), null, callback);
if (!first) { ... return inviteInfoWaiting != null ? inviteInfoWaiting.getSsrcInfo() : null; }
// gb28181/service/impl/PlayServiceImpl.java:435-440
```

- 回调与认领时间放在同一个 Holder，注册用 `ConcurrentHashMap.compute`（`gb28181/service/impl/InviteStreamServiceImpl.java:359-372`），不会出现"回调加到已被移除的列表上"。
- 通知权归属用返回值裁决：`map.remove(key)` 成功者才 `notifyCallbacks`（430-436）；兜底清理用 `remove(key, holder)` 比较后删除（500-511）。**同一 Holder 不会被通知两次**。
- 超时兜底 `cleanExpiredInviteCallbacks` 在 `playTimeout * 3` 时用 `ERROR_FOR_INVITE_TIMEOUT(-15)` 通知，由 `@Scheduled(fixedRate = 10000)` 驱动（486-512、581-585）。
- **单个回调抛异常不能影响其它回调**：逐个 `try/catch` + `log.error` + 继续（448-462）。回归测试 `src/test/java/com/genersoft/iot/vmp/gb28181/service/impl/InviteStreamServiceImplTest.java:85-100`。
- `removeInviteInfo` **刻意不清 `inviteCallbackMap`**（294-299）：`updateInviteInfoForSSRC` 等更新路径会先删 Redis 再写回，清回调会让"点播成功但 HTTP 超时"。测试：同文件 183-212。
- 认领释放后必须能被重新注册（`onceAndFirst` 再返回 true），测试：同文件 66-83、116-134。

### 5. `DeferredResult` 超时

- 超时时间取 `userSetting.getPlayTimeout()`（默认 10000 毫秒，`conf/UserSetting.java:39`）。
- `onTimeout` 只做：设置结果 + 通知 Service 释放（`gb28181/controller/PlayController.java:98-108`），不在 Controller 里自己删 Redis/播放状态。
- 回调把 `InviteErrorCode` 原值写进 `WVPResult.code`（`PlayController.java:136-139`），因此前端可能收到**负数 code**；`request.js:48` 用 `res.code && res.code !== 0` 判断，负数同样会走错误分支。新增接口若要保持 `ErrorCode` 语义，需显式映射。

---

## API Error Responses

### 形状（`vmanager/bean/WVPResult.java:23-28`）

```json
{ "code": 0,   "msg": "成功",       "data": { } }
{ "code": 403, "msg": "无权限操作", "data": null }
```

工厂方法：`success()` / `success(t)` / `success(t, msg)` / `fail(int, String)` / `fail(ErrorCode)`（31-49）。

### 前端消费约定

- `code` 为 0 或缺失都算成功：`web/src/utils/request.js:48`。
- 业务失败直接把 `msg` 抛给调用方、弹窗展示：`request.js:49`、`82-87`。
- 因此 `msg` 必须是给人看的中文短句，不能是堆栈或 SQL。

### 认证失败

- 未登录由 `conf/security/AnonymousAuthenticationEntryPoint.java:32-43` 直接写 **HTTP 401** + `{"code":401,"msg":"请登录后重新请求"}`，不走 `WVPResult` 包装；登录接口命中时 `msg` 替换为异常消息（36-38）。
- `UserController.login` 自己先 catch `AuthenticationException` → `ControllerException(ERROR100, e.getMessage())`（`vmanager/user/UserController.java:61-65`），所以 `BadCredentialsException` handler 只是兜底。
- 鉴权规则与放行路径在 `conf/security/WebSecurityConfig.java:117-121`、`100`（`/index/hook/**` permitAll）。

---

## Common Mistakes

1. **把底层异常消息直接返回前端。**
   反例（不要模仿）：`GlobalExceptionHandler.java:33` 的 `WVPResult.fail(ErrorCode.ERROR500.getCode(), e.getMessage())`；`PlaybackController.java:171,173` 的 `new ControllerException(..., e.getMessage())`；`gb28181/controller/MobilePositionController.java:98` 的 `"命令发送失败: " + e.getMessage()`。
   正确写法：对外给固定码/固定文案（如 `throw new ControllerException(ErrorCode.ERROR100)`），完整异常只出现在 `log.error(..., e)`。

2. **在 Controller 里 `try/catch` 后手工 `new WVPResult<>()`。**
   直接 `throw new ControllerException(...)`，交给全局处理器。`PlayController.java:101-104` 在 `onTimeout` 里手工 setCode 是例外——`DeferredResult` 回调没有异常出口，属于不得已。

3. **混用 `ErrorCode` 与 `InviteErrorCode`。**
   存量混用点：`MessageSubscribe.java:31`、`service/redisMsg/service/RedisRpcPlayServiceImpl.java:163,169,186`、`jt1078/service/impl/SourcePTZServiceForJTImpl.java:88`。新代码：HTTP 用 `ErrorCode`，异步点播用 `InviteErrorCode`。

4. **在 `removeInviteInfo` / `updateInviteInfoForSSRC` 路径里清等待回调。**
   会导致点播实际成功但 HTTP 超时；等待认领只能由 `call()` 与 `cleanExpiredInviteCallbacks` 释放（`InviteStreamServiceImpl.java:294-299`）。

5. **假设二次 `setResult` 会覆盖第一次。**
   `onTimeout` 与业务回调可能同时到达。清理逻辑必须能判断"我拥有哪个请求/哪个 claim"，不能按设备+通道盲删。

6. **给排除路径（`/api/v1`、`/index/hook`）新增 `WVPResult` 返回值。**
   这些路径不经过 `GlobalResponseAdvice`，返回 `WVPResult` 会原样输出，破坏对接方协议（`GlobalResponseAdvice.java:34-39`）。
