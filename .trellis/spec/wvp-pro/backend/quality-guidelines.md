# Quality Guidelines

> 后端代码质量规范：禁止模式、必须模式、测试要求、评审清单。
> 来源：`doc/编程规范.md` 第一、五、十一、十二、十三、十五、十六节，按本主题拆解并补充代码事实。
> 原则：**新代码必须遵守，存量代码逐步靠拢**；文中标注的反例是历史遗留，不要照抄。

---

## Overview

- 适用范围：`src/main/java/com/genersoft/iot/vmp/` 与 `src/test/java/com/genersoft/iot/vmp/`。
- 项目没有配置 Checkstyle / SpotBugs / PMD / JaCoCo（`pom.xml` 中无相关插件），质量靠规范 + 评审 + 单元测试保证。
- 唯一硬性构建约束：JDK 21（`pom.xml:63` `<java.version>21</java.version>`）；测试依赖只有 `spring-boot-starter-test`（`pom.xml:412`）。
- 改动必须最小：只改必要行，不整文件格式化、不顺手重构无关代码（`doc/编程规范.md` §1）。

---

## Forbidden Patterns

**1. 新增 `System.out` / `System.err` / `printStackTrace`**
统一用 Lombok `@Slf4j` + 参数化占位符（`@Slf4j` 在 `src/main/java` 下 224 个文件使用）。

```java
// 正确
log.error("[点播] 回调处理异常，释放点播请求, deviceId={}, channelId={}", device.getDeviceId(), channel.getChannelId(), e);
```

存量反例（不要模仿）：`System.out`/`System.err` 非注释行 6 处（`conf/ftpServer/VirtualFtpFile.java:131,163`、`gb28181/conf/StackLoggerImpl.java:54`、`gb28181/transmit/SIPProcessorObserver.java:164`、`jt1078/proc/request/J0104.java:167`、`vmanager/TestController.java:52`）；`printStackTrace` 非注释行 7 处（`common/StreamInfo.java:367`、`gb28181/bean/GBStringMsgParser.java:191,208,251`、`utils/SSLSocketClientUtil.java:18,20`、`conf/security/AnonymousAuthenticationEntryPoint.java:45`）。

**2. 在接口或 Controller 上放 `@Transactional`**
事务只能落在 ServiceImpl 的 public 方法上（`doc/编程规范.md` §5）。存量反例：`gb28181/service/IDeviceService.java:118`（接口方法上的 `@Transactional`）、`vmanager/user/UserApiKeyController.java`（7 处 `@Transactional` + `public synchronized void add`，第 51-52 行）。

**3. `synchronized (str.intern())` 按设备/通道串行化**
`String.intern()` 锁的是 JVM 全局字符串池，容易与其它模块互相阻塞。存量反例：`gb28181/service/impl/DeviceServiceImpl.java:765` `synchronized (device.getDeviceId().intern())`。
替代：按 key 取锁对象——`gb28181/session/CatalogDataManager.java:45-48`（`ConcurrentHashMap<String, ReentrantLock>` + `computeIfAbsent`），`gb28181/session/SSRCFactory.java:81,105`（`lockMap.computeIfAbsent(...)`）。

**4. 跨线程使用非并发容器 / 无条件删除 Map 条目**
清理运行态必须用 `remove(key, expectedValue)`：`conf/DynamicTask.java:155,158,209,212`、`gb28181/service/impl/InviteStreamServiceImpl.java:500`。用 `map.remove(key)` 会误删其它线程刚注册的新任务/新回调。

**5. 用 `Optional` 表达可空**
`src/main/java` 与 `src/test/java` 中 `Optional` 出现 0 次（`doc/编程规范.md` §12）。判空用 `ObjectUtils`/`StringUtils`；注意本项目混用两种 `ObjectUtils`：Spring 版 64 个文件、`org.apache.commons.lang3` 版 11 个文件（如 `conf/DynamicTask.java:4`），新代码优先 Spring `org.springframework.util.ObjectUtils`。

**6. 查询列表返回 `null`**
列表/集合返回空集合：`storager/impl/RedisCatchStorageImpl.java:52` 返回 `Collections.emptyList()`；Controller 空结果返回 `PageInfo.emptyPageInfo()`（`gb28181/controller/ChannelController.java:160,188,215`）。查询单条允许返回 `null`（如 `DeviceServiceImpl.java:810` 的 `getDeviceStatus` 在信令异常分支 826 行返回 `null`），调用方必须判空。

**7. 用 `SimpleDateFormat` / 自定义时区**
时间统一走 `utils/DateUtil`（时区常量 `zoneStr = "Asia/Shanghai"`，`utils/DateUtil.java:60`，68 个文件引用）。存量仅剩 1 处反例：`service/impl/AlarmServiceImpl.java:103` `new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")`。

**8. 拼接 SQL 外部参数**
必须 `#{}`；存量反例 `gb28181/dao/provider/ChannelProvider.java:306-321` `queryInListByStatus` 直接 `sqlBuild.append(channel.getGbId())`（详见 `database-guidelines.md`）。

**9. 敏感信息进日志/返回值**
存量反例：`web/gb28181/ApiController.java:90` 在 `log.debug` 中打印 `password`；`conf/GlobalExceptionHandler.java:33` 把 `e.getMessage()` 直接返回前端。

---

## Required Patterns

**1. 分层与错误出口**
业务异常抛 `conf/exception/ControllerException`，由 `conf/GlobalExceptionHandler` 转成 `WVPResult`；异步/协议回调用 `service/bean/ErrorCallback<T>` + `service/bean/InviteErrorCode`，不要跨线程抛异常。普通 Controller 返回值由 `conf/GlobalResponseAdvice` 包装（排除路径见 `conf/GlobalResponseAdvice.java:34`）。

**2. 并发状态：容器 + 条件删除 + 明确归属**
- 共享可变状态用 `ConcurrentHashMap`、`CopyOnWriteArrayList`、`Atomic*`（如 `InviteStreamServiceImpl.java` 导入 `ConcurrentHashMap`/`CopyOnWriteArrayList`/`AtomicBoolean`，`CloudRecordSessionServiceImpl.java:50-51` 两个 `ConcurrentMap`）。
- 注册-通知的原子性用 `ConcurrentHashMap.compute`，不要 `computeIfAbsent` + 手动 add（`InviteStreamServiceImpl.java:362`，理由见该处 Javadoc 第 345-355 行）。
- 条件删除是硬要求：`InviteStreamServiceImpl.java:500` 的 `remove(key, holder)` 失败即表示已被 `call()` 通知过，必须 `continue` 而不是重复通知。

**3. `DynamicTask`：key 全局唯一，结束即移除**
- key 在全局 `futureMap` 内有效，跨设备复用会互相覆盖；带设备的 key 要拼上 `deviceId`/`channelId`（示例：`PlayServiceImpl.java:1425` 用 `VideoManagerConstants.BROADCAST_WAITE_INVITE + deviceId`，1429 行注册）。
- 任务结束/取消后必须移除 future，否则同 key 无法重新注册：`DynamicTask.stop()` 的 Javadoc 完整说明了这个陷阱（`conf/DynamicTask.java:101-122`），条件删除实现见 155-166 行。
- `startDelay` 内部先 `stop(key)` 再 schedule（`conf/DynamicTask.java:72-76`），调用方不要再手工 stop。

**4. 复杂并发方法必须写 Javadoc**
写清不变量、原子边界、并发窗口、失败兜底。正面示例：
- `conf/DynamicTask.java:101-122`（`stop`：为何不能残留 completed future，为何用比较后删除）
- `conf/DynamicTask.java:187-196`（`execute`：弱一致迭代 + 判空）
- `gb28181/service/impl/InviteStreamServiceImpl.java:342-358`（认领为何用 `compute`）、`464-484`（兜底清理的并发边界）

**5. 状态清理走统一出口**
设备/平台 BYE、SIP 事务清理复用 `gb28181/service/IDialogTerminationService`（实现 `DialogTerminationServiceImpl`），不要新增 `cmder.streamByeCmd` 旁路。

**6. 失败路径必须闭环**
每个运行态都要有创建、完成、超时、失败清理四条路径；单条回调抛异常不能影响其它等待者（`InviteStreamServiceImplTest.java:86` 即为该契约的测试）。

---

## Testing Requirements

**框架与边界**
- JUnit 5 + Mockito（经 `spring-boot-starter-test` 引入），**纯单元测试，不启动 Spring 上下文**：`src/test/java` 下 `@SpringBootTest` 0 处。
- Mockito 统一 `@ExtendWith(MockitoExtension.class)` + `@Mock` + `@InjectMocks`（10 个类使用 `MockitoExtension`，8 个使用 `@InjectMocks`，如 `conf/DynamicTaskTest.java:29-36`）。
- 不依赖 MySQL/Redis/ZLM：Redis 用 mock（`InviteStreamServiceImplTest`、`SipInviteSessionManagerTest`）。
- 需要验证 Controller 契约时用 `MockMvcBuilders.standaloneSetup(...)` 而非启动容器（`vmanager/cloudRecord/CloudRecordSessionControllerTest.java:56`）。

**命名**
- 测试类放被测类同包，命名 `*Test`（现有 20 个 `*Test.java`，其中 `jt1078/JT1078ServerTest.java` 是带 `main` 的手工调试入口、无 `@Test`，不是单元测试）。
- 方法名 `method_condition_expected`，断言消息写业务不变量，例如 `DynamicTaskTest.java:39` `stop_shouldRemoveCompletedFuture_andStartDelayShouldRegisterAgain()`、`SSRCFactoryTest.java:37` 的 `assertEquals(10, ssrc.length(), "SSRC should be 10 characters: ...")`。
- 存量不一致：111 个 `@Test` 方法用下划线三段式，44 个用 camelCase 语句式（如 `PlayServiceImplTest.java:93` `playDepartureShouldRemoveInviteInfoImmediately`）。**新测试用三段式。**

**必须覆盖的断言类型**
- Provider/SQL：断言包含 `#{...}`、不包含原始参数值（含注入串），见 `gb28181/dao/provider/ChannelProviderTest.java:20-37`。
- 并发/清理：断言"旧任务被移除且新任务可注册"（`DynamicTaskTest.java:39-61`）、"一个回调抛异常不影响其他等待者"（`InviteStreamServiceImplTest.java:86-100`）、"按实例条件删除"（`InviteStreamServiceImplTest.java:267` `execute_shouldNotRemoveDownloadInviteInfoOfNewSessionWithSameStream`）。
- 修 bug **必须**补回归测试，至少覆盖失败、超时、重复调用、并发清理之一（`doc/编程规范.md` §13）。项目已有先例：`git log` 中 `e89a75ad8 fix: 到期任务清理改为按实例条件删除...`、`b20d048b4 ...修复看门狗残留及回调丢失/永久残留问题` 均附带测试。

**运行方式（重要陷阱）**
- `pom.xml:472` 在 `maven-surefire-plugin` 中硬编码 `<skipTests>true</skipTests>`，**`-DskipTests=false` 不生效**。跑测试用 IDE，或临时改 `false` 后恢复，不要提交该改动。
- 必须用 JDK 21，较新 JDK 下 Mockito 可能失败。
- 现有 `SSRCFactoryTest.java:89` 有 1 个 `@Disabled`，新代码不要习惯性 `@Disabled` 跳过失败用例。

---

## Code Review Checklist

先给结论：**建议合并 / 可合并但需处理 / 建议发回作者修改**。

- [ ] 改动是否最小？有无无关格式化、重命名、依赖升级混入（`doc/编程规范.md` §15）。
- [ ] 新增 `@Transactional` 是否只落在 ServiceImpl 的 public 方法上？是否把 SIP 等待、ZLM HTTP、Redis 轮询包进了事务？
- [ ] 共享状态是否用了并发容器？Map 清理是否 `remove(key, expectedValue)`？是否明确"我拥有哪个请求/哪个 claim"，而不是按设备+通道盲删？
- [ ] `DynamicTask` 的 key 是否全局唯一？任务完成/取消路径是否都能移除 future？
- [ ] BYE/事务清理是否复用了 `IDialogTerminationService`，而不是新增 `streamByeCmd` 旁路？
- [ ] 列表返回是否为空集合？单条 `null` 的调用方是否判空？有没有引入 `Optional`？
- [ ] 时间是否走 `DateUtil`？是否新增了 `SimpleDateFormat`？
- [ ] 日志是否 `@Slf4j` + `{}`、中文 + 模块前缀、异常对象放最后？有无 `System.out`、`printStackTrace`、密码/Token/pushKey 泄露？
- [ ] Provider 外部参数是否 `#{}`？`IN` 是否 `<foreach>` 且空集合跳过条件？
- [ ] 修 bug 是否附带回归测试？测试是否不依赖 Spring/MySQL/Redis/ZLM？
- [ ] 是否在 `pom.xml` 里留下了 `skipTests` 的临时改动？
