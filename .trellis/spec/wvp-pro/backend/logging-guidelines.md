# Logging Guidelines

> How logging is done in this project.

---

## Overview

- 日志栈：SLF4J + Logback（Spring Boot 自带），唯一配置文件 `src/main/resources/logback-spring.xml`。
- 本文中未写全路径的类名均位于 `src/main/java/com/genersoft/iot/vmp/` 下，冒号后为行号。
- 业务代码统一用 Lombok `@Slf4j`：当前 224 个文件使用（共 783 个 Java 文件）。手工 `LoggerFactory.getLogger` 只有 11 个文件，多数是 Lombok 覆盖不到的场景（如 `src/main/java/com/genersoft/iot/vmp/gb28181/conf/StackLoggerImpl.java`、`service/impl/LogServiceImpl.java` 需要取特定/root logger）；但其中 `media/abl/ABLMediaNodeServerService.java:46` 已加 `@Slf4j` 仍在 `:50` 重复声明 logger 并混用，`gb28181/controller/RegionController.java:26` 声明后全类 0 次使用（死代码）——这类不要模仿。
- 生效级别来自 `logback-spring.xml` 的 `<root level="INFO">`，同时挂 `STDOUT`、`websocket`、`RollingFile` 三个 appender。`application*.yml` 里没有 `logging.level`；`src/main/resources/配置详情.yml` 的 `logging` 段只是配置展示样例（文件头注明"不可直接使用"）。要调级别改 logback 或启动参数，不要在业务代码里放宽级别。
- 日志文件（`LOG_HOME=logs` 是相对路径，取决于启动工作目录）：
  - 业务日志 `logs/wvp-yyyy-MM-dd.%i.log`：单文件 20MB，保留 30 天（`<appender name="RollingFile">`）。
  - SIP 日志 `logs/sip-yyyy-MM-dd.%i.log`：单文件 50MB，保留 30 天，仅由 logger `com.genersoft.iot.vmp.gb28181.conf.StackLoggerImpl`（level=info，`additivity=true` 所以仍会进 root appender）额外输出。改这个类名或 appender 名会让 SIP 日志静默丢失。
  - 文件 pattern：`%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50}:%L - %msg%n`，控制台带颜色。
  - `service/impl/LogServiceImpl.java:78-83` 通过 root logger 的 `RollingFile` appender 反查目录，重命名该 appender 会同时弄坏日志查询接口。
- `logs/` 已忽略（`.gitignore:6`）；docker 部署挂载 `./logs/wvp:/opt/wvp/logs/`（`docker/docker-compose.yml:109`）。
- 日志不只落盘：`websocket` appender（`src/main/java/com/genersoft/iot/vmp/conf/webLog/WebSocketAppender.java`）把每条日志推到 `/channel/log`（`conf/webLog/LogChannel.java`），`vmanager/log/LogController.java` 还提供 `/api/log/list` 和 `/api/log/file/{fileName}` 下载。**日志内容等同于接口可读数据**，任何写进日志的凭据都会同时暴露给 WebSocket 客户端和日志下载接口。
- 禁止 `System.out.println` / `printStackTrace`（`doc/编程规范.md` 第九节）。存量反例（不要模仿）：`conf/ftpServer/VirtualFtpFile.java:163`、`gb28181/conf/StackLoggerImpl.java:54`、`gb28181/transmit/SIPProcessorObserver.java:164`、`vmanager/TestController.java:52`；`common/StreamInfo.java:367`、`conf/security/AnonymousAuthenticationEntryPoint.java:45`、`gb28181/bean/GBStringMsgParser.java:191/208/251`、`utils/SSLSocketClientUtil.java:18/20`。

---

## Log Levels

- `info`：生命周期与关键动作，一次请求 1～2 条。例：`PlayServiceImpl.java:480` `[点播成功]`、`:512` `[点播开始]`、`RegisterRequestProcessor.java:169` `[注册请求]`。
- `debug`：参数细节、逐条消息，生产默认不输出。例 `ChannelFrontEndController.java:49`、`DeviceConfig.java:31` 用 `if (log.isDebugEnabled())` 包裹 API 入参。
- `warn`：可恢复、已兜底、但需要关注的异常。例 `PlayServiceImpl.java:360/369/379`（未找到可用 ZLM/通道）、`InviteStreamServiceImpl.java:503`（点播等待超时已回收）、`DialogTerminationServiceImpl.java:103`（BYE 发送失败）。
- `error`：请求/任务失败且需要人工排查。例 `PlayServiceImpl.java:496`（回调异常并释放点播）、`GlobalExceptionHandler.java:32`（全局异常）。
- `trace`：当前 0 处使用（`log.trace` 无匹配），不要引入第五种级别习惯。
- 高频路径（ZLM hook、Redis 消息、批量通道同步）用 `debug`；设备注册/点播等一次性动作才用 `info`。粗略统计（排除注释行）：info 852、error 447、warn 375、debug 102 —— error 偏多，新增代码不要把可恢复失败打成 error。
- 只有 `String.format`、`JSON.toJSONString()` 这类有构建成本的参数才需要 `isDebugEnabled()` 守卫；纯 `{}` 占位符不需要。

---

## Structured Logging

- 用参数化占位符 `{}`，禁止 `+` 拼接和 `String.format`。存量反例（不要模仿）：`PlaybackController.java:182/197/211`、`PlayServiceImpl.java:635/639`、`streamProxy/controller/StreamProxyController.java:97/118`、`gb28181/controller/DeviceQuery.java:159/179`（拼接式日志约 37 处）。
- 异常对象必须是最后一个参数，SLF4J 才会打印堆栈。正例 `PlayServiceImpl.java:496`：
  `log.error("[点播] 回调处理异常，释放点播请求， deviceId: {}, channelId: {}", device.getDeviceId(), channel.getDeviceId(), e);`
  以及 `InviteStreamServiceImpl.java:107`。反例：`PlayServiceImpl.java:544` `log.error("[命令发送失败] 点播消息: {}", e.getMessage());`，堆栈全丢；error 级日志中这种只打 message 的写法有 214 处，新代码不要再写。
- 中文模块前缀统一 `[模块]` 开头、后接空格再写消息。全库共 504 种不同前缀，按域归类（括号为出现次数，仅列高频/代表性前缀）：
  - 国标信令/业务：`[注册请求]` `[注销请求]` `[国标级联]`(40) `[目录订阅]` `[移动位置订阅]` `[报警订阅]` `[Invite 200OK]`(12) `[收到bye]`(12) `[Dialog终止]` `[SIP事务]` `[SIP日志]` `[INFO 消息]`(28)
  - 点播/回放/下载：`[点播]`(17) `[点播开始]` `[点播成功]` `[点播失败]` `[点播等待超时]` `[录像回放]`(11) `[录像下载]`(11) `[云端录像]`(9) `[流离开]` `[停止播放]` `[快照]` `[语音对讲]`(18) `[语音喊话]`(11) `[点播通用通道]`(23)
  - 媒体服务：`[ZLM HOOK]`(18) `[ZLM-尝试连接]` `[ZLM-心跳超时]` `[媒体服务节点]` `[拉流代理]` `[主动停止推流]` `[ABL-尝试连接]`
  - Redis/集群：`[redis-rpc]`(37) `[Redis-InviteInfo]` `[Redis-Catalog]` `[REDIS消息-分组信息更新]` 等 `[REDIS消息-*]` 系列、`[redis发送通知]`
  - JT1078：`[JT-位置汇报]`(9) `[JT-点播]` `[JT-回放]` `[JT-对讲]` `[JT-录像]` `[JT-云台控制]`
  - 框架/安全：`[API AUTH]`(13) `[Token生成失败]` `[Token解析失败]` `[SY-接口验签]`(15) `[Web-Log]` `[全局异常]` `[定时任务]`
  - 命令发送统一用 `[命令发送失败]`(181)，后接动作：`[命令发送失败] 点播消息: ...`。
  以上不是全量清单；新增模块沿用已有前缀，不要为同一动作另造同义词。
- 前缀里不要塞动态值。`CatalogEventLister.java:49` 的 `[Catalog事件: {}]` 是存量写法，新代码写 `[Catalog事件] type={}`。
- 日志正文带定位字段：`deviceId`、`channelId`、`stream`、`callId`、`platformId`。例 `DialogTerminationServiceImpl.java:73`：`log.warn("[Dialog终止] 事务缺少 SipTransactionInfo, callId={}", callId);`。
- 禁止整对象倾倒：`log.info(JSON.toJSONString(x))`、`log.info("前缀：" + json)`。反例：`service/redisMsg/RedisPushStreamListMsgListener.java:122/128`（无前缀、无占位符，直接输出 JSON）。

---

## What to Log

- 设备/平台生命周期：注册、注销、SIP 应答码及原因。例 `RegisterRequestProcessor.java:178/186`（回复 401/403 及原因）。
- 点播/回放/下载的关键节点与结果：开始、成功、失败原因、超时回收。例 `PlayServiceImpl.java:480`、`InviteStreamServiceImpl.java:503/541`。
- 会话终止与 BYE：统一由 `DialogTerminationServiceImpl.java:73/103/165/228` 输出，清理动作必须带 `callId`/`stream` 才能追到具体会话。
- 状态迁移与脏数据处理：如 `InviteStreamServiceImpl.java:245` 清理脏数据时输出 `key={}, value={}`。
- 失败必须带上下文 + 完整堆栈（异常对象放最后），保证能按 `deviceId`/`channelId` 在 `logs/wvp-*.log` 中检索。
- 安全事件：验签失败、Token 失效要记录，但只保留可公开标识。正例 `web/custom/conf/SignAuthenticationFilter.java:62/72/115` 只打印 `appKey` 和 `requestURI`。**反例（不要模仿）**：同文件 `:127` 把整个 `beforeSign` 打进日志，而 `:123` 刚 `beforeSign.append(secret)`，`:94` 又把除 `sign` 外的全部请求参数（含 `accessToken`）拼入 `beforeSign`，签名失败分支会同时输出 `secret` 与 `accessToken` 明文。

---

## What NOT to Log

- 禁止记录：`password`、`gbPassword`、`pushKey`、`token`/`accessToken`/`refreshToken`、`secret`、`Authorization` 请求头、Redis 密码、SIP/设备口令、私钥与 JWT 签名材料（`doc/编程规范.md` 第九节）。字段真实存在：`storager/dao/dto/User.java:15`（pushKey）、`gb28181/bean/Device.java:196`（password）、`gb28181/bean/CommonGBChannel.java:78`（gbPassword）。
- 不要直接打印含上述字段的实体、`toString()` 或 JSON。反例（不要模仿）：`CommonGBChannel.toString()` 包含 `gbPassword`（`CommonGBChannel.java:416`），而 `DeviceChannelServiceImpl.java:636`、`PlayServiceImpl.java:1788/1794/1906/1924/1936/1951/1972` 直接 `log.warn("...{}...", channel)` 打印整个通道对象，设备口令随之进日志。需要时只打 `channel.getGbId()`、`getDataDeviceId()`。
- 不要在登录/鉴权路径打印凭据。反例（不要模仿）：`web/gb28181/ApiController.java:90` 在 debug 日志里用 `String.format` 打印 `username` 和 `password`（且未用 `{}`）。重构该段时不要保留该输出。
- 不要打印完整配置对象（Redis/SIP/媒体节点），只打 id、host、port 等非敏感字段；`conf/security/JwtUtils.java:126` 只打 `keyId` 是正例。
- 不要把数据库异常原文、文件绝对路径、堆栈拼进返回给前端的 message（`doc/编程规范.md` 第八节），详细原因写日志。`GlobalExceptionHandler.java:32-33` 把 `e.getMessage()` 返回前端属于既有问题，新接口不要照做。
- 日志文件本身是敏感资产：`conf/webLog/LogChannel.java` 的 `/channel/log` 会实时推送全部日志（前端 `web/src/views/operations/realLog.vue` 直接连接），`vmanager/log/LogController.java` 提供日志文件列表与下载。"只在 debug 里打一下"的凭据会被这两条通道放大。
