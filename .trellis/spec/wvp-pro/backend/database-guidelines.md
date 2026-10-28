# Database Guidelines

> Database patterns and conventions for this project.
> 本文由 `doc/编程规范.md` 第六节「DAO 与 SQL」、第三节「命名与类型」、第十节（Redis key 部分）拆解而来，
> 所有结论均以当前代码库实际状态为准，非理想化规范。

---

## Overview

- **持久层是 MyBatis 注解式 Mapper，不是 JPA**。共 21 个 `@Mapper` 接口（13 个另加 `@Repository`），分布：
  `gb28181/dao`、`jt1078/dao`、`storager/dao`、`streamProxy/dao`、`streamPush/dao`。
- **没有 XML Mapper**：`src/main/resources/` 下只有 `logback-spring.xml`，`application.yml` 也没有
  `mybatis.mapper-locations`。不要新增 XML。
- **动态 SQL 放 `dao/provider/*Provider`**：Mapper 用 `@SelectProvider` / `@InsertProvider` 指向
  Provider 方法，方法签名统一 `String xxx(Map<String, Object> params)`。参考
  `src/main/java/com/genersoft/iot/vmp/gb28181/dao/provider/ChannelProvider.java`（48 个返回 SQL 的方法）。
- **多数据库**：`src/main/java/com/genersoft/iot/vmp/conf/MybatisConfig.java` 的 `databaseIdProvider`
  注册了 `mysql`、`postgresql`、`kingbase`、`h2`、`dm`；Mapper 上用 `databaseId = "..."` 分支。
- **无 Flyway / Liquibase**（`pom.xml` 无相关依赖），结构变更靠 `数据库/<version>/` 下的 SQL 脚本。
- **Redis key 统一放 `src/main/java/com/genersoft/iot/vmp/common/VideoManagerConstants.java`**，
  不要在 DAO/Service 里写字符串 key；按实例隔离的 key 追加 `userSetting.getServerId()`
  （参考 `gb28181/session/SipInviteSessionManager.java` 的 `SIP_INVITE_SESSION_STREAM + userSetting.getServerId()`）。

---

## Query Patterns

### 基本写法

```java
@Mapper
@Repository
public interface CommonGBChannelMapper {
    @SelectProvider(type = ChannelProvider.class, method = "queryById")
    CommonGBChannel queryById(@Param("gbId") int gbId);        // 动态 SQL → Provider

    @Update("UPDATE wvp_device_channel SET stream_id = #{stream} where id = #{gbId}")  // 简单 SQL → 注解
    void updateStream(int gbId, String stream);
}
```

- 多参数（≥2）**必须**写 `@Param`；单参数可省略，但 Provider 场景依赖 `Map` key，实际仍需 `@Param`
  （`ChannelProvider.queryByDataId` 读 `params.get("dataType")` / `params.get("dataDeviceId")`）。
- 插入回填自增主键用 `@Options(useGeneratedKeys = true, keyProperty = "gbId", keyColumn = "id")`
  （`CommonGBChannelMapper.insert` 回填 `gbId`；`DeviceMapper.add`、`GroupMapper`、`RecordPlanMapper` 回填 `id`）。
- **PostgreSQL / 达梦不要依赖 `useGeneratedKeys` 取序列值**，用 `@SelectKey(databaseId = ...)`：
  `storager/dao/UserApiKeyMapper.add` 对 `postgresql` 取 `currval(...)`、对 `mysql`/`dm` 取 `LAST_INSERT_ID()`。
- 写操作返回 `int` 影响行数（`insert`/`update`/`batchUpsert`）；存量有部分 `void`（`CommonGBChannelMapper.delete(int gbId)`、
  `reset(...)`、`updateStream(...)`），新代码返回行数，由调用方决定是否校验，**不要用异常控制正常分支**。
- 分页统一 `PageHelper.startPage(page, count)` 后**紧接**查询，再 `new PageInfo<>(list)`：
  `gb28181/service/impl/GbChannelServiceImpl.java` 的 `queryListByCivilCode`。中间不要插其他 SQL。

### `#{}` 强制、`${}` 白名单

- 所有外部参数一律 `#{...}`，包括 `List` 元素：`#{channelDbIds[i]}`、`#{deviceList[i].id}`、
  `#{item.gbId}`。
- 全库 SQL 中只有一处 `${}`：`CommonGBChannelMapper.reset` 的 `,${item} = null`（`@Value("${...}")` 之类配置占位符不算）。它之所以可接受，是因为
  Service 侧已把前端传入的字段名收敛为「`CommonGBChannel` 的可读属性名 → lowerCamel 转 lowerUnderscore」：
  `GbChannelServiceImpl.reset` 用 `BeanWrapperImpl.isReadableProperty` 过滤后
  `CaseFormat.LOWER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, ...)`。
  **新增 `${}` 必须提供同等强度的字段白名单，不能直接接收入参。**
- 排序字段同理：`ChannelProvider.queryListWithChildForSy` 用 `switch (sortName)` 枚举白名单
  （`gbId`/`gbDeviceId`/`gbName`/`gbStatus`/`createTime`/`updateTime`/`deviceCode`），不拼接原始入参。

### 集合 IN 与空集合

- 有空判断的写法（可照抄）：`ChannelProvider.appendChannelDbIdsFilter` /
  `appendChannelDbIdsFilterForWdc`（`channelDbIds != null && !isEmpty()` 才拼 `IN`）；
  `queryOnlineListsByGbDeviceIds`（list 为 null 或空则不拼条件）。
- 空集合语义在 Controller/Service 层兜住：`ChannelController` 里非管理员且无关联通道时直接
  `return PageInfo.emptyPageInfo();`，**不把空集合传进 mapper**。
- 存量反例（不要模仿）：`ChannelProvider.queryListInBox`、`queryListInCircleFor*`、`queryListInPolygonFor*`
  直接 `for (CameraGroup group : groupList)` 无判空；`queryByIds` 无判空，
  空列表会生成非法 `in ( )`。`queryByGbDeviceIds` 虽然也遍历集合、空集合会生成 `in ( )`，
  但绑定的是 `#{deviceIds[0]}` 占位符（不会拼原始值）。
- 支持 `<foreach>` 的两种形态都要注意：注解内联的 `<script>` 片段
  （`CommonGBChannelMapper.queryListByDeviceIds` 的 Provider 返回 `<script>` + `collection='deviceIds'`，
  另有 `CommonGBChannelMapper.queryByGbDeviceIdsForIds` 直接用 `@Select` + `<script>`）和
  Provider 里手写 `#{deviceIds[0]}`（`queryByGbDeviceIds`）。**两者都不要拼原始值。**
- 多语句批量（`<foreach ... separator=';'>`，全库 14 处，如 `CommonGBChannelMapper.batchUpdate`）
  依赖 MySQL 的 `allowMultiQueries=true`（`src/main/resources/application-dev.yml` 与
  `application-docker.yml` 的 JDBC URL 已带）。新增此类 SQL 前先确认目标数据库连接串支持多语句；
  PostgreSQL/达梦是否默认支持**未确认**，跨库场景优先拆成单条批量或 `batchUpsert`。

### 多数据库分支

```java
@InsertProvider(type = MysqlCommonChannelUpsertProvider.class,      method = "batchUpsert", databaseId = "mysql")
@InsertProvider(type = PostgresStyleCommonChannelUpsertProvider.class, method = "batchUpsert", databaseId = "postgresql")
@InsertProvider(type = PostgresStyleCommonChannelUpsertProvider.class, method = "batchUpsert", databaseId = "kingbase")
@InsertProvider(type = H2CommonChannelUpsertProvider.class,         method = "batchUpsert", databaseId = "h2")
@InsertProvider(type = DmCommonChannelUpsertProvider.class,         method = "batchUpsert", databaseId = "dm")
int batchUpsert(@Param("channels") List<CommonGBChannel> channels);
```

- 两套 Provider 并存，别混用：
  - `*CommonChannelUpsertProvider`（`gb_` 字段）→ `CommonGBChannelMapper.batchUpsert`
  - `MysqlChannelUpsertProvider` / `PostgresStyleUpsertProvider` / `H2ChannelUpsertProvider` /
    `DmChannelUpsertProvider`（旧字段）→ `DeviceChannelMapper.batchUpsert`
  - 语法差异：MySQL `ON DUPLICATE KEY UPDATE`、PG/Kingbase `ON CONFLICT (gb_device_id) DO UPDATE`、
    H2 `MERGE ... KEY (gb_device_id)`、达梦 `MERGE INTO ... USING (SELECT ... UNION ALL)`。
- 几何查询要改 5 个 databaseId：`queryListInCircle` / `queryListInPolygon` 的
  `mysql`+`h2` 共用 `ChannelProvider.queryListInCircleForMysql`（`ST_Distance_Sphere`），
  `kingbase`+`postgresql` 共用 `...ForKingBase`（`ST_DistanceSphere` / `ST_MakePoint`），
  `dm` 用 `...ForDm`（纯 haversine 弧度计算，不依赖空间扩展）。
- **修改 upsert / 几何 / 分页 SQL 时，必须同步检查全部受支持数据库的分支**，漏一个只在对应库上炸。

---

## Migrations

- 目录按版本组织：`数据库/<version>/`，当前存在 `2.6.9`、`2.7.0`、`2.7.1`、`2.7.3`、`2.7.4`、`2.7.4-h2`、`3.0.0`、`old`。
- 每版本两类脚本，**结构变更必须两边都改**：
  - `初始化-{mysql,postgresql-kingbase,达梦}-<version>.sql` —— 全量建表
  - `更新-{mysql,postgresql-kingbase}-<version>.sql` —— 增量升级
- 增量脚本要**幂等**：MySQL 用 `DROP PROCEDURE IF EXISTS` + `information_schema.columns` 判断后
  `ALTER`（`数据库/3.0.0/更新-mysql-3.0.0.sql` 的 `wvp_20260606`、`wvp_20261019` 两个存储过程）；
  PG/Kingbase 用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `DO $$ ... TO_REGCLASS(...)`。
- H2 另有 `数据库/2.7.4-h2/h2-schema.sql` + `h2-data.sql`，仅在 `application-dev.yml` 中被注释掉的
  `spring.sql.init` 引用；H2 建表要与之保持同构。
- `wvp_user_channel` 是二开独有表（上游没有），已在 `数据库/2.7.4/`、`数据库/2.7.4-h2/h2-schema.sql`、
  `docker/mysql/db/wvp.sql` 及 `数据库/3.0.0/` 三方言初始化 + 两份更新脚本中补齐。
  **下次从上游合并时该表仍会被上游脚本覆盖/遗漏**，合并后需复查 `数据库/3.0.0/` 五个脚本是否仍含该表。
- 达梦只有初始化脚本，`2.7.4` 与 `3.0.0` 均无 `更新-达梦-*.sql`；达梦升级路径**未确认**。

---

## Naming Conventions

- 表名统一 `wvp_` 前缀、`snake_case`；Java 字段 `camelCase`。
  `MybatisConfig` 打开了 `config.setMapUnderscoreToCamelCase(true)`，因此 `gb_device_id` ↔ `gbDeviceId`
  自动映射；但 Provider 里手写 `as gb_id` 这类别名时**必须自己保证**与 Bean 属性一致
  （`ChannelProvider.BASE_SQL` 的 `id as gb_id`）。
- 唯一约束命名为 `uk_*`：`uk_device_device`、`uk_wvp_unique_channel`（`gb_device_id`）、
  `uk_device_channel_source`（`data_device_id, device_id`）、`uk_user_channel`（`user_id, channel_id`）。
  普通索引多为匿名 `index (data_type)` / `index (data_device_id)`（存量写法，新索引建议显式命名）。
- **两套 ID 必须分清**（最常踩的坑）：

  | 概念 | 字段/类型 | 含义 |
  |------|-----------|------|
  | 国标编码 | `deviceId` / `channelId` / `gbDeviceId`，`String` | SIP 协议标识，如 `34020000001320000001`，不能当外键 |
  | 数据库主键 | `id`，多数是 `int`/`Integer` | `wvp_device.id`、`wvp_device_channel.id` |
  | 外键 | `dataDeviceId`，`Integer` | `wvp_device_channel.data_device_id`，指向来源设备主键 |
  | 用户关联主键 | `channelDbId` / `channelDbIds`，`Integer` | `wvp_user_channel.channel_id` = `wvp_device_channel.id` |

- 特别注意 `CommonGBChannel.gbId`：**名字带 gb，实际是数据库自增主键**，不是国标编码
  （`@Schema(description = "国标-数据库自增ID")`；SQL 中 `id as gb_id`）。国标编码在 `gbDeviceId`。
- 表里的 `device_id` 是「所属设备的国标编码（String）」，`data_device_id` 是「来源设备主键（Integer）」，
  两者不可互换。`device_id` 与 `data_device_id` 拼成唯一键：`uk_device_channel_source`。
- `data_type` 取值用常量类 `common/enums/ChannelDataType`（`GB28181=1`、`STREAM_PUSH=2`、
  `STREAM_PROXY=3`、`JT_1078=200`），Java 里不要写裸数字；`channel_type` 默认 `0`，
  绝大多数查询都带 `channel_type = 0` 过滤。
- 新增参数命名要让调用方一眼看出是「库 ID」还是「国标编码」：用 `channelDbIds`、`dataDeviceId`、
  `gbDeviceId`，不要一律叫 `channelId`。

---

## Common Mistakes

- **存量反例（不要模仿）：`ChannelProvider.queryInListByStatus` 直接拼接数值 ID**
  （`src/main/java/com/genersoft/iot/vmp/gb28181/dao/provider/ChannelProvider.java`）：
  ```java
  for (CommonGBChannel channel : commonGBChannelList) {
      sqlBuild.append(channel.getGbId());   // 应改成 #{commonGBChannelList[i].gbId}
  }
  ```
  即使当前是内部数值，也应使用 `#{}`；该 SQL 空集合还会生成 `id in ( )`。
  该方法当前**无任何调用方**（仅 Mapper 声明 + Provider 实现），属死代码。
- 同类拼接反例（同一 Provider，均为 `List<Integer>` / 对象列表直接 `append`）：
  `queryByIds`、`queryByDeviceIds`、`queryByIdsOrCivilCode`、`queryByDataTypeAndDeviceIds`、
  `queryListByStreamPushList`、`queryCameraChannelByIds`、`queryOldChanelListByChannels`。
  其中 `queryByIds`、`queryByDataTypeAndDeviceIds`、`queryCameraChannelByIds`、
  `queryOldChanelListByChannels`、`queryListByStreamPushList` 正被 `GbChannelServiceImpl`、
  `RecordPlanServiceImpl`、`CameraChannelService` 调用；`queryByDeviceIds` 无 Mapper 引用、
  `queryByIdsOrCivilCode` 无调用方，属死代码。改动时按 `#{}` 重写并补 Provider 单测，参考
  `src/test/java/com/genersoft/iot/vmp/gb28181/dao/provider/ChannelProviderTest.java`
  的断言方式：`assertTrue(sql.contains("#{deviceIds[0]}"))` + `assertFalse(sql.contains("raw value"))`。
- 反例：`CommonGBChannelMapper.queryOnlineListsByGbDeviceId(@Param("deviceId") int deviceId)`
  的 SQL 是 `data_device_id = #{deviceId}` —— 参数名叫 `deviceId` 实际是设备**库主键**，
  与「`deviceId` 表示国标编码」的约定冲突。新代码请用 `deviceDbId` / `dataDeviceId`。
  同类：`UserChannelMapper.deleteByDeviceDbId(@Param("deviceDbId") int deviceDbId)` 是正确示范。
- 反例：把国标编码与库主键混用。`UserChannelMapper` 的类注释已明确
  「`channel_id` 使用 `wvp_device_channel.id`（数据库主键），不是通道国标编号」，
  新写的关联表/过滤条件一律遵守；SQL 里用 `dc.id` / `wdc.id`，**禁止**用 `device_id` 做关联过滤。
- 反例：新增 XML Mapper 或把动态 SQL 写进 Service 字符串。项目 0 个 XML，动态 SQL 一律进 `dao/provider`。
- 反例：只改一种方言。`CommonGBChannelMapper` 的 `batchUpsert` 有 5 个 `databaseId` 分支，
  只改 `MysqlCommonChannelUpsertProvider` 会让 PG/Kingbase/H2/达梦静默丢字段。
- 修 bug 的回归要求：涉及 DAO/SQL 的修复必须补一个 Provider 单测，断言使用 `#{}`、不含原始参数值、
  空集合不生成 `IN ()`；涉及建表/字段变更时同时改 `初始化-*` 与 `更新-*`。
