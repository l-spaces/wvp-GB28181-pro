# Directory Structure

> 后端目录结构与分层组织。原则：**新代码按本文件落点，存量代码逐步靠拢**。
> 来源：`doc/编程规范.md` 第一、二节 + 对 `src/main/java/com/genersoft/iot/vmp/` 的实际核对。

---

## Overview

后端是**单 Maven 模块**（无多 module），根包 `com.genersoft.iot.vmp`，共 782 个 `.java` 文件。入口 `VManageBootstrap`（`@SpringBootApplication` + `@ServletComponentScan("com.genersoft.iot.vmp.conf")` + `@EnableScheduling` + `@EnableAsync` + `@EnableCaching`），见 `src/main/java/com/genersoft/iot/vmp/VManageBootstrap.java`。

一级包按**业务域**切分，不是按技术层切分；同一业务域内部再按 Controller/Service/DAO 分层：

```
Controller（<业务域>/controller、vmanager/、web/）
    ↓ 只做参数校验 + 调 Service
Service 接口（I*Service）+ impl（*ServiceImpl）
    ↓
DAO（*Mapper + dao/provider 动态 SQL）
    ↓
storager（Redis 缓存）/ 运行态内存（session、task、conf/DynamicTask）
横切：common（常量与跨域 bean）、conf（配置/安全/调度/全局异常）、utils（通用工具）
```

`doc/编程规范.md` §一：Controller 只做参数校验、调用 Service、组织响应；业务逻辑、SQL、Redis 操作下沉。

---

## Directory Layout

实际结构（括号内为该目录 `.java` 文件数，统计自当前工作区）：

```
src/main/java/com/genersoft/iot/vmp/
├── VManageBootstrap.java                 # 唯一启动类
├── common/ (18)                          # VideoManagerConstants(Redis key 前缀)、InviteInfo、StreamInfo、
│                                         # CommonCallback/SubscribeCallback、enums/ChannelDataType...
├── conf/ (49)                            # UserSetting、DynamicTask、GlobalExceptionHandler、GlobalResponseAdvice、
│   ├── exception/                        # ControllerException、ServiceException
│   ├── security/                         # WebSecurityConfig、JwtAuthenticationFilter、JwtUtils、dto/
│   ├── redis/                            # RedisTemplateConfig、RedisMsgListenConfig、RedisRpcConfig
│   ├── websocket/  webLog/  ftpServer/   # WebSocket、日志采集、FTP
├── gb28181/ (271)                        # GB28181 主域
│   ├── SipLayer.java                     # SIP 协议栈装配
│   ├── auth/ (1)  bean/ (85)  conf/ (4)
│   ├── controller/ (27 = 14 个 Controller + controller/bean 13)
│   ├── dao/ (9 个 Mapper) + dao/provider/ (10)
│   ├── event/ (15)                       # EventPublisher、SipSubscribe、alarm/channel/device/record/sip/subscribe
│   ├── service/ (19 接口) + service/impl/ (19 实现)
│   ├── session/ (6)                      # SipInviteSessionManager、CatalogDataManager、SSRCFactory、AudioBroadcastManager
│   ├── task/ (11)                        # deviceStatus、deviceSubscribe、platformStatus
│   ├── transmit/ (57)                    # ISIPProcessorObserver/SIPSender、cmd/(ISIPCommander+impl)、callback/、event/
│   └── utils/ (7)                        # SipUtils、XmlUtil、MessageElement（SIP XML 领域工具）
├── jt1078/ (171)                         # JT808/JT1078，内部同样 controller/dao/service/bean/event/util
│   └── proc/ (76)                        # 协议编解码：entity/factory/request/response
├── media/ (78)                           # ZLMediaKit / ABL 接入
│   ├── zlm/ (31)                         # ZLMHttpHookListener、dto/hook、event
│   ├── abl/ (20)                         # ABLHttpHookListener、ABLRESTfulUtils、bean/hook
│   ├── service/                          # IMediaServerService、IMediaNodeServerService + impl
│   └── event/ (19)  bean/ (4)
├── service/ (78)                         # 跨模块服务：IUserService、IRoleService、IAlarmService、IMediaService、
│   ├── bean/                             #  ICloudRecordService、IRecordPlanService ... + impl/
│   └── redisMsg/                         # Redis 消息/RPC（服务间协同），control/ 下是 @Component 的 RPC handler
├── storager/ (18)                        # IRedisCatchStorage + impl + dao/（User/Role/Alarm/RecordPlan...）
├── streamProxy/ (10)、streamPush/ (12)   # 拉流代理 / 推流代理，各自 controller/dao/service/bean
├── utils/ (18)                           # DateUtil、JsonUtil、HttpUtils、SpringBeanFactory、redis/RedisUtil...
├── vmanager/ (36)                        # 平台管理 REST，按功能子包：user/、alarm/、cloudRecord/、recordPlan/、rtp/、server/、log/、ps/
└── web/ (22)                             # 外部兼容 API
    ├── gb28181/ (6)                      # /api/v1/*（ApiController 等）+ dto/
    └── custom/ (16)                      # /api/sy 第三方对接，自带 bean/conf/service
```

**没有 XML Mapper**：`src/main/resources` 下不存在任何 `*Mapper.xml`（只有 `logback-spring.xml`），`pom.xml` 走 `mybatis-spring-boot-starter`。SQL 全部写在 `@Mapper` 接口上，两种写法并存：

- 注解内联：21 个 `*Mapper` 都在注解上写 SQL，且都至少有一处 `<script>` 动态 SQL（如 `storager/dao/UserMapper.java:18`）。
- `@*Provider` 委托：仅 4 个 Mapper 使用 —— `gb28181/dao/CommonGBChannelMapper.java`、`gb28181/dao/DeviceChannelMapper.java`、`jt1078/dao/JTChannelMapper.java`、`streamProxy/dao/StreamProxyMapper.java`，SQL 体在 `dao/provider/*Provider` 里以方法返回字符串。

`doc/编程规范.md` §六要求**新增的复杂动态 SQL 放 `dao/provider`**，不要再往注解里堆 `<script>`；已有的内联 SQL 保持不动。

---

## Module Organization

### 新增代码落点

| 新增内容 | 落点 |
|---|---|
| SIP 信令、设备/通道、点播回放、级联 | `gb28181/` 对应子包（信令 `transmit/`、会话 `session/`、订阅 `task/`） |
| JT808/JT1078 | `jt1078/`，协议编解码进 `jt1078/proc/` |
| 媒体节点（ZLM/ABL）接入 | `media/zlm/` 或 `media/abl/`；节点抽象服务进 `media/service/` |
| 跨模块复用服务（用户、角色、告警、录像计划、云录像、日志） | `service/` 接口 + `service/impl/` |
| Redis 缓存读写 | `storager/IRedisCatchStorage` 及其 impl；不要在业务类里散落 key |
| 配置、安全、调度、全局异常 | `conf/`（`conf/security`、`conf/redis`、`conf/DynamicTask`） |
| 业务域自己的 Controller | **该业务包下** `controller/`（例：`jt1078/controller/JT1078Controller.java`，`/api/jt1078`） |
| 平台管理 REST | `vmanager/<功能>/`（例：`vmanager/user/UserController.java`，`/api/user`） |
| 外部兼容 API | `web/gb28181/`（多为 `/api/v1`），固定 `@Hidden` |
| 真正跨域的通用工具 | `utils/` |

### REST 入口的定位差异（不要混用）

| 入口 | 数量 | 路径前缀 | 约定 |
|---|---|---|---|
| `web/gb28181/` | 5 个 Controller | 4 个在 `/api/v1`（`ApiController`、`ApiStreamController`、`ApiDeviceController`、`ApiControlController`），`AuthController` 在 `/auth` | 外部兼容 API，响应结构不能改；均标 `@Hidden` 不进文档；`/api/v1` 被 `GlobalResponseAdvice` 排除自动包装（`src/main/java/com/genersoft/iot/vmp/conf/GlobalResponseAdvice.java:34`），`/auth` 不在此列 |
| `gb28181/controller/` | 14 个 Controller | `/api/device/*`、`/api/play`、`/api/common/channel`、`/api/gb_record` 等 | 国标设备管理 API，`@Tag` 中文名 |
| `vmanager/` | 13 个 Controller | `/api/user`、`/api/server`、`/api/alarm` 等 | 平台管理 API（用户/角色/告警/录像计划/云录像/RTP） |
| `web/custom/` | 1 个 Controller | `/api/sy` | 第三方对接 API（`CameraChannelController`），另有 `conf/SignAuthenticationFilter`（`@ConditionalOnProperty("sy.enable")`）只对 `/api/sy` 做 sign 校验 |
| 业务包内 controller | `jt1078/` 2、`streamProxy/` 1、`streamPush/` 1 | `/api/jt1078`、`/api/proxy`、`/api/push` | 有独立业务域时自带 Controller，不塞进 `vmanager` |
| 媒体节点回调 | `media/zlm/ZLMHttpHookListener.java`、`media/abl/ABLHttpHookListener.java` | `/index/hook`、`/index/hook/abl` | ZLM/ABL 的 hook 回调，同样被排除自动包装，返回结构由媒体服务器协议决定 |

管理 API 的落点按**接口服务的业务域**选：国标设备/通道/点播 → `gb28181/controller/`；用户、角色、告警、录像计划、云录像、RTP 等平台级能力 → `vmanager/<功能>/`；JT1078、拉流/推流代理 → 各自包的 `controller/`。不要为了「放 vmanager 更整齐」把国标业务逻辑搬过去。

### 分层红线

- **Controller 不直接注入 `*Mapper`**：当前 38 个 `@RestController`（另有 `web/gb28181/ApiController` 是 `@Controller`）中直接引用 Mapper 的为 0，保持这个状态。
- **Controller 不直接操作 Redis**：违反时业务状态会绕过 `IRedisCatchStorage` 的 key 约定。存量反例（不要模仿）：`src/main/java/com/genersoft/iot/vmp/vmanager/ps/PsController.java:65` 注入后直接调用了 12 次 `redisTemplate`（`:116` 起）；`vmanager/rtp/RtpController.java:65` 同类问题（`:156` 起 13 次）；`vmanager/TestController.java:28` 也是直接注入使用。另有一处死注入：`src/main/java/com/genersoft/iot/vmp/gb28181/controller/ChannelController.java:53` 注入了 `redisTemplate` 但全类未使用。
- **`@Transactional` 只在 ServiceImpl 的 public 方法**，不放接口。存量反例：`src/main/java/com/genersoft/iot/vmp/gb28181/service/IDeviceService.java:118`。
- **`Controller` 后缀不等于 HTTP 入口**：`service/redisMsg/control/RedisRpc*Controller` 是 `@Component` 的 Redis RPC handler（例：`RedisRpcChannelPlayController.java:29`）。新增非 HTTP 类不要叫 `Controller`。

### 多数据类型扩展：策略 bean 命名

通道能力（播放/回放/下载/云台/其他/对讲）按 `ChannelDataType` 的数据类型分派，靠 **bean 名 = 前缀常量 + 数据类型** 自动收集。当前共 12 个实现，分散在各业务包，但 bean 名统一：

```java
// gb28181/service/impl/SourcePlayServiceForGbImpl.java:20
@Service(ChannelDataType.PLAY_SERVICE + ChannelDataType.GB28181)   // "sourceChannelPlayService1"
public class SourcePlayServiceForGbImpl implements ISourcePlayService { ... }
```

```java
// gb28181/service/impl/GbChannelPlayServiceImpl.java:36,96-100
@Autowired
private Map<String, ISourcePlayService> sourcePlayServiceMap;
// ...
ISourcePlayService sourceChannelPlayService = sourcePlayServiceMap.get(ChannelDataType.PLAY_SERVICE + dataType);
if (sourceChannelPlayService == null) {
    // 通道数据异常
    log.error("[点播通用通道] 类型编号： {} 不支持实时流预览", ChannelDataType.getDateTypeDesc(channel.getDataType()));
    throw new PlayException(Response.BUSY_HERE, "channel not support");
}
```

分布：`gb28181/service/impl/` 6 个（`SourcePlay/Playback/Download/PTZ/Other/Broadcast...ForGbImpl`），`jt1078/service/impl/` 4 个（`...ForJTImpl`），`streamProxy/service/impl/` 1 个，`streamPush/service/impl/` 1 个。

新增一种数据类型或一种能力时：在**该业务包**的 `service/impl` 下加 `SourceXxxServiceFor<Type>Impl`，`@Service` 名沿用 `common/enums/ChannelDataType` 的前缀常量，**不要改 `GbChannelPlayServiceImpl` 的分派逻辑**。

---

## Naming Conventions

| 类型 | 规则 | 真实样例 |
|---|---|---|
| 包名 | 全小写单词，不用下划线 | `gb28181`、`streamProxy` |
| Service 接口 | `I*Service` | `IPlayService`、`IInviteStreamService`、`IDialogTerminationService` |
| Service 实现 | `*ServiceImpl`（36 个） | `PlayServiceImpl`、`InviteStreamServiceImpl`、`DialogTerminationServiceImpl` |
| Mapper | `*Mapper` + `@Mapper`（21 个，其中 13 个另加 `@Repository`） | `gb28181/dao/DeviceMapper.java:13-15` |
| 动态 SQL | `dao/provider/*Provider`，方法返回 SQL 字符串 | `DeviceChannelProvider.queryChannels(Map)` |
| 多数据库 SQL | `Mysql*/PostgresStyle*/Dm*/H2*` + `databaseId` | `DeviceChannelMapper.java:204-208` |
| Controller | `*Controller` | `PlayController`、`StreamProxyController` |
| 请求对象 | `*Param` / `*Request` | `UpdateChannelParam`、`StreamProxyParam`、`CloudRecordSessionRequest` |
| 响应对象 | `*Result` / `*Content` | `PlayResult`、`StreamContent`、`CameraStreamContent` |
| 分页 | `com.github.pagehelper.PageInfo<T>` | `gb28181/controller/ChannelController.java:138`；Service 内 `PageHelper.startPage(page, count)` 后紧跟查询 |
| 全局结果/错误码 | `WVPResult`、`ErrorCode` 在 `vmanager/bean/` | `vmanager/bean/WVPResult.java`、`vmanager/bean/ErrorCode.java` |
| 常量/枚举 | `common/` 与 `common/enums/` | `VideoManagerConstants`、`InviteSessionType`、`ChannelDataType` |

存量命名反例（不要模仿，也不要顺手全局改名）：

- `service/impl/RoleServerImpl.java:12` —— 应为 `RoleServiceImpl`（`Server` 拼写错误）。
- `jt1078/service/Ijt1078Service.java`、`Ijt1078PlayService.java` —— 接口名 `I` 后未大写（对照 `IPlayService`）。
- `web/custom/service/CameraChannelService.java:42` —— 服务类没有 `I*Service` 接口，且直接 `implements CommandLineRunner`（注意：同目录的 `SyServiceImpl.java:23` 实现的是 `service/IMapService`，属于正常形态）。
- `gb28181/controller/DeviceConfig.java`、`DeviceControl.java`、`DeviceQuery.java` —— 是 `@RestController` 但没有 `Controller` 后缀。
- `streamPush/enent/StreamPushUploadFileHandler.java` —— 目录名 `enent` 是 `event` 的拼写错误。
- `utils/`、`gb28181/utils/`、`jt1078/util/` 三种写法并存（`util` 单数仅 `jt1078` 使用）。
- `utils/Coordtransform.java:11` 与 `gb28181/utils/Coordtransform.java:11` 是两份同名同实现类，新增坐标转换时先用现成的那一份，不要再复制第三份。
- `service/bean/PushStreamStatusChangeFromRedisDto.java`、`streamPush/bean/StreamPushExcelDto.java` —— `Dto` 后缀大小写与 `storager/dao/dto` 目录并存。

### `utils` 不是垃圾桶

`utils/` 只放**跨业务域、无状态**的工具（`DateUtil`、`JsonUtil`、`HttpUtils`、`SpringBeanFactory`、`utils/redis/RedisUtil`）。领域工具放领域包：

- SIP 报文/XML 组装 → `gb28181/utils/`（`SipUtils`、`XmlUtil`、`MessageElement`）
- JT1078 组包/BCD → `jt1078/util/`（`BCDUtil`、`Bin`）
- 媒体节点 HTTP 调用 → `media/zlm/AssistRESTfulUtils`、`media/abl/ABLRESTfulUtils`

判断标准：工具类是否需要 import 某个业务包的 bean（如 `gb28181.bean.Device`）。需要 → 归领域包。

---

## Examples

### 组织完整的业务域：`gb28181/`

`gb28181/` 是分层最完整的一级包（271 个文件）：协议（`SipLayer`/`transmit`）、会话（`session`）、业务（`service`/`impl`）、存储（`dao`/`dao/provider`）、定时任务（`task`）、事件（`event`）、接口（`controller`）全部拆开。`jt1078/`（171 个文件）结构类似但无 `task`/`transmit`，编解码集中在 `proc/`。新增同类重业务域时照此结构。

关键类：`gb28181/service/impl/PlayServiceImpl.java`（1985 行，点播编排）、`gb28181/service/impl/InviteStreamServiceImpl.java`、`gb28181/service/impl/DialogTerminationServiceImpl.java`（BYE/事务清理的唯一入口）、`gb28181/session/SipInviteSessionManager.java`（SIP 事务持久化到 Redis）。

### 分页接口的标准形态

```java
// gb28181/controller/ChannelController.java:138
public PageInfo<CommonGBChannel> queryList(int page, int count, ...) { ... }
// 空结果返回 PageInfo.emptyPageInfo()（同文件 :160），不要返回 null
```

### 自查命令

新增文件后，确认落点与命名：

```bash
# 1) Controller 里是否直接注入 Mapper（结果应为空）
grep -rn "Mapper .*;" --include=*Controller.java src/main/java/

# 2) 是否新增了 XML Mapper（结果应为空，只应剩 logback-spring.xml）
find src/main/resources -name '*.xml'

# 3) 新增/改动的文件是否都落在自己业务包内
git status --short src/main/java/com/genersoft/iot/vmp/
```
