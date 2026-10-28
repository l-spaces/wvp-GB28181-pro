# 通道显示级权限过滤（用户-通道关联）

> 来源任务：`09-09-user-channel-assign`（用户关联设备/通道分配与查询过滤）。
> 本文是可执行契约：新增任何"列出设备/通道"的分页或树接口时，必须按此对齐过滤逻辑。

---

## Scenario: 按用户关联通道的显示级过滤

### 1. Scope / Trigger

- 触发：新增 DB 表 `wvp_user_channel` + 新 API（`/api/user/channel/*`）+ 跨层过滤契约（Controller → Service → Mapper/Provider）。
- 适用：任何按登录用户可见范围过滤设备/通道的分页列表、树、统计接口。
- 边界：只做**显示级**过滤（列表不返回未关联通道），**不做**操作接口（播放/云台/对讲）鉴权——用户拿不到未关联的 `channelId` 即无法操作。

### 2. Signatures

**DB**（`channel_id` = `wvp_device_channel.id` 数据库主键，非国标编号）：

```sql
create table wvp_user_channel (
    id          serial primary key,
    user_id     integer NOT NULL,   -- wvp_user.id
    channel_id  integer NOT NULL,   -- wvp_device_channel.id（数据库主键）
    create_time varchar(50) NOT NULL,
    constraint uk_user_channel unique (user_id, channel_id)
);
```

**API**（`UserChannelController`，鉴权照抄 `RoleController`：`roleId != 1` → `ERROR403`）：

- `GET  /api/user/channel/list?userId=`            → `List<DeviceChannel>`
- `POST /api/user/channel/assign?userId=&channelIds=1,2,3` → 全量覆盖保存（`channelIds` 可空=清空）

**Service**（`IUserChannelService`）：

- `boolean isFilterNeeded()` —— 过滤判定统一入口
- `List<Integer> getUserChannelIds()` —— 当前用户关联的通道库主键
- `List<Integer> getUserChannelDeviceIds()` —— distinct 关联通道所属设备库主键
- `void saveChannelsForUser(int userId, List<Integer> channelIds)` —— `@Transactional`（delete + batchAdd）
- 级联清理：`removeByDeviceDbId` / `removeByChannelIds` / `removeForNotify`

**Provider 过滤分支**（`null`/空时不拼接 SQL）：

- `DeviceChannelProvider`：`channelDbIds` 分支 `AND dc.id in (...)`
- `ChannelProvider.appendChannelDbIdsFilter`（无表别名 → `AND id in (...)`）
- `ChannelProvider.appendChannelDbIdsFilterForWdc`（`wdc` 别名 → `AND wdc.id in (...)`）

### 3. Contracts

**两套 ID 约定（核心陷阱，务必区分）：**

| 概念 | 字段 | 类型 | 用途 |
|------|------|------|------|
| 通道库主键 `channelDbId` | `wvp_device_channel.id` | `Integer` | 关联、过滤、播放/云台接口参数 |
| 国标编号 | `device_id` / `gb_device_id` | `String`（如 `10000000001321010801`） | SIP 协议标识，**不可用于关联过滤** |

- 过滤参数一律命名 `channelDbIds`（`List<Integer>`），SQL 只用 `dc.id` / `wdc.id` / `id`，**禁止**用 `device_id`。
- `isFilterNeeded()` 契约：`SecurityUtils.getUserInfo()` 为 `null`（未登录/内部调用）或 `role.id == 1`（管理员）→ `false`（不过滤）；否则 `true`。
- 空关联语义：非管理员且 `channelDbIds` 为空 → 直接返回 `PageInfo.emptyPageInfo()`（列表）/ 空 `List`（树）/ `ResourceBaseInfo(0,0)`（统计）；**绝不把空集合传入 mapper 的 foreach**。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| 未登录（`getUserInfo()==null`） | 不过滤（兼容内部 RPC/定时任务） |
| `roleId == 1`（管理员） | 不过滤，返回全量（与改动前一致） |
| 非管理员 + 有关联 | `AND id in (channelDbIds)` 过滤 |
| 非管理员 + 空关联 | 返回空（`emptyPageInfo` / 空 `List` / `0`），不报错 |
| 非管理员访问 `/api/user/channel/*` | `ERROR403` |
| 给 `roleId==1` 用户 `assign` | `Assert` 拒绝（管理员默认全量，无需分配） |
| `channelIds` 含不存在的 id | `saveChannelsForUser` 经 `listExistingChannelIds` 过滤后入库（防脏数据） |

### 5. Good/Base/Bad Cases

- Good：非管理员关联 2 个通道 → 列表/统计/树/播放仅这 2 个可见。
- Base：管理员 → 全量，行为与改动前完全一致（过滤点短路）。
- Bad（既定行为）：非管理员无任何关联 → 列表为空，不报错（PRD 确认）。

### 6. Tests Required

- 过滤注入点（每个列表/树/统计接口）：非管理员关联 N → `total == N`；空关联 → `total == 0`；管理员 → 全量。断言点：分页 `total`、树分支含关联通道及其祖先节点、`ResourceBaseInfo.total`。
- 鉴权：非管理员访问 `assign`/`list` → HTTP 返回 `403` 码。
- 级联：删除设备 / 目录同步移除通道后，`wvp_user_channel` 对应行被清除。
- 回归：管理员各页面全量可见（`roleId==1` 不受影响）。

### 7. Wrong vs Correct

**Wrong**

```java
// ① 空集合直接进 foreach → SQL "IN ()" 语法错误或全表返回
List<Integer> ids = userChannelService.getUserChannelIds(); // 可能为空
return channelService.queryList(..., ids);

// ② 用国标编号过滤库主键列 → 永远匹配不到
sqlBuild.append(" AND dc.device_id in (#{channelDbIds[0]})");

// ③ 分页后在内存里 filter → 分页 total 失真
PageInfo<X> p = mapper.query(...);
p.getList().removeIf(c -> !ids.contains(c.getId()));
```

**Correct**

```java
// ① 非管理员空关联短路
List<Integer> channelDbIds = null;
if (userChannelService.isFilterNeeded()) {
    channelDbIds = userChannelService.getUserChannelIds();
    if (channelDbIds == null || channelDbIds.isEmpty()) {
        return PageInfo.emptyPageInfo();
    }
}
return channelService.queryList(..., channelDbIds);

// ② provider 用库主键，null/空不拼接（沿用 DeviceChannelProvider 既有写法）
List<Integer> channelDbIds = (List<Integer>) params.get("channelDbIds");
if (channelDbIds != null && !channelDbIds.isEmpty()) {
    sqlBuild.append(" AND dc.id in ( ");
    for (int i = 0; i < channelDbIds.size(); i++) {
        if (i > 0) sqlBuild.append(",");
        sqlBuild.append("#{channelDbIds[").append(i).append("]}");
    }
    sqlBuild.append(" )");
}
// ③ 过滤参数在 PageHelper.startPage 之后的 mapper 调用中传入，交由分页 SQL 执行
```

---

## 过滤注入点清单（新增列表/树/统计接口须逐一对齐）

| 场景 | 入口 → 实现 | 过滤参数 |
|------|-------------|----------|
| 设备分页 | `DeviceQuery.devices` → `DeviceServiceImpl.getAll` | `deviceDbIds` |
| 设备下通道分页 | `DeviceQuery.channels` → `DeviceChannelServiceImpl.queryChannelsByDeviceId` | `channelDbIds` |
| 通道列表（全部/行政区划/组织机构页签） | `ChannelController.queryList` / `queryListByCivilCode` / `queryListByCivilCodeForUnusual` / `queryListByParentId` / `queryListByParentForUnusual` | `channelDbIds` |
| 控制台资源统计 | `ServerController.getResourceInfo` → `getUserDeviceOverview` / `getUserChannelOverview` | 关联集内部计算 |
| 组织机构树 / 行政区划树 | `GroupServiceImpl` / `RegionServiceImpl` | 保留含关联通道的分支 + 其祖先节点 |
| 报警列表 | `AlarmController` → `AlarmServiceImpl` | `channelDbIds` |
| 录制计划 | `RecordPlanController` → `RecordPlanServiceImpl` | `channelDbIds` |

> 陷阱记录：组织机构页签走 `/api/common/channel/parent/list`（`queryListByParentId`）与 `/parent/unusual/list`，**极易漏接**——树过滤做了、列表过滤忘了，会导致非管理员在组织机构页签看到全部通道。新增页签务必对照本清单。

## 级联删除语义

- 删除设备（`DeviceServiceImpl.delete` / `cleanChannelsForDevice`）→ `removeByDeviceDbId`
- 目录同步移除通道（`resetChannels` 删除分支）→ `removeByChannelIds`
- 通知删除 → `removeForNotify`；通道删除（`GbChannelServiceImpl.delete`）→ `removeByChannelIds`
- **子查询型删除（`removeByDeviceDbId`/`removeForNotify`）必须在通道行物理删除之前执行**（否则子查询查不到通道）。
- 仅离线 / 心跳 / WVP 重启 → **不清理**关联；设备删除后重新注册通道主键会变，需管理员重新分配（不做自动迁移）。

## Design Decision: 新增 `channelDbIds` 分支而非复用既有 `channelIds`

- **Context**：`DeviceChannelProvider.queryChannels` 已有 `channelIds` 分支，但它匹配的是**国标编号 `device_id`**，不是库主键。
- **Decision**：不改既有语义，新增独立的 `channelDbIds` 分支（`dc.id in ...`），只在过滤注入点传入，其余调用方传 `null` → SQL 零改动。
- **Why**：`null` 兼容保证对多调用方共用的 provider 零影响，回滚只需让参数恒为 `null`。
