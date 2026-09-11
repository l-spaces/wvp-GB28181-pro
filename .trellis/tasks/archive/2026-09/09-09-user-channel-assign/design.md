# 技术设计：用户关联设备（通道）分配与查询过滤

## 1. 数据模型

新增表 `wvp_user_channel`：

```sql
drop table IF EXISTS wvp_user_channel;
create table IF NOT EXISTS wvp_user_channel
(
    id          serial primary key COMMENT '主键ID',
    user_id     integer NOT NULL COMMENT '用户ID（wvp_user.id）',
    channel_id  integer NOT NULL COMMENT '通道数据库主键ID（wvp_device_channel.id）',
    create_time character varying(50) NOT NULL COMMENT '创建时间'
);
-- 唯一约束：同一用户同一通道只允许一条
create unique index IF NOT EXISTS uk_user_channel on wvp_user_channel (user_id, channel_id);
```

- channel_id 使用 `wvp_device_channel.id`（数据库主键），与大屏播放/云台接口参数一致（`visual/src/api/wvp.ts` 中 channelId 即此主键）。
- 不使用角色维度，不做软删除。
- 同步更新 `script/sql/初始化-mysql-2.7.4.sql` 及 `数据库/2.7.4/` 下各库脚本（照现有表风格）。

## 2. 后端新增

### 2.1 Mapper：`storager/dao/UserChannelMapper.java`（新增）

按现有注解 SQL 模式（参考 `RoleMapper`、`DeviceChannelMapper`）：

- `add(int userId, int channelId, String createTime)` / `batchAdd(List)`（foreach insert，存 user_id、channel_id、create_time）；
- `deleteByUserId(int userId)`：全量覆盖式保存的前置删除；
- `listChannelIdsByUserId(int userId)` → `List<Integer>`：过滤用的核心查询；
- `listChannelsByUserId(int userId)` → `List<DeviceChannel>`（JOIN `wvp_device_channel` 取通道明细，用于管理接口查询展示）；
- `listDeviceIdsByUserId(int userId)` → `List<Integer>`（distinct 关联通道的 `data_device_id`，用于设备列表过滤）。

### 2.2 Service：`IUserChannelService` + `impl/UserChannelServiceImpl`（新增）

- `getChannelsForUser(int userId)`：JOIN 查询已关联通道明细；
- `saveChannelsForUser(int userId, List<Integer> channelIds)`：事务内 `deleteByUserId` + `batchAdd`；
- `getUserChannelIds()` / `getUserChannelDeviceIds()`：供过滤使用的便捷方法（内部取 `SecurityUtils.getUserInfo()` 判断角色，见 2.4）。

### 2.3 Controller：`vmanager/user/UserChannelController.java`（新增）

挂 `/api/user/channel`（与现有 user 模块同包同鉴权模式）：

- `GET /api/user/channel/list?userId=` → `List<DeviceChannel>`：查询某用户已关联通道（需管理员）；
- `POST /api/user/channel/assign?userId=&channelIds=1,2,3`（或 JSON body）→ 全量覆盖保存（需管理员）。

鉴权照抄 `RoleController`：`SecurityUtils.getUserInfo().getRole().getId() != 1` 则抛 `ERROR403`。Swagger 注解风格与现有 Controller 一致。

### 2.4 查询过滤（显示级，两个注入点）

**判定逻辑统一封装**：新增工具方法（建议放 `IUserChannelService`，如 `isFilterNeeded()`）：取 `SecurityUtils.getUserInfo()`，为 null（未登录，如内部 RPC 调用）或 `roleId == 1` → 不过滤；否则过滤。

**注入点 1：设备分页列表**
`DeviceQuery.devices()` → `DeviceServiceImpl.getAll(page, count, query, status)`（`DeviceServiceImpl.java:955`）：
- 新增重载/可选参数 `List<Integer> deviceDbIds`：非空时 `deviceMapper.getDeviceList` 的查询增加 `AND id IN (...)` 过滤（`DeviceMapper` 对应方法为 SelectProvider 生成，需在 provider 中加分支；或在 service 层换成带过滤的 mapper 方法）；
- 设备过滤使用的 id 是 `wvp_device.id`（数据库主键），`UserChannelMapper.listDeviceIdsByUserId` 返回的就是 `wvp_device_channel.data_device_id`（即设备库主键），两端对齐。

**注入点 2：设备下通道分页**
`DeviceQuery.channels()` → `DeviceChannelServiceImpl.queryChannelsByDeviceId(...)`（`DeviceChannelServiceImpl.java:492`）：
- 该方法最终调 `channelMapper.queryChannels(device.getId(), ...)`（`DeviceChannelMapper.java:94`），其 `@SelectProvider`（`DeviceChannelProvider.queryChannels`，provider 文件 64-117 行）已有 `channelIds` 参数分支（按 `dc.device_id in (...)`）——但注意该分支匹配的是**通道国标编号 device_id**，不是库主键。
- **设计取舍**：不改动 provider 现有语义，在 service 层过滤——`queryChannelsByDeviceId` 拿到分页结果后无法过滤（分页 SQL 已执行）。因此采用：service 方法新增可选参数 `List<Integer> channelDbIds`，provider 的 `queryChannels` 新增同名分支 `AND dc.id IN (...)`（库主键）。`queryChannels` 的调用方较多，新增独立参数并只在两个注入点传入，其余调用方传 null 不受影响。

**PageHelper 注意**：过滤条件必须在 `PageHelper.startPage` 之后执行的那条 SQL 里（在 mapper 参数中传，不能内存过滤分页结果）。

### 2.5 管理员行为

roleId==1：所有过滤点直接短路（不查关联表），行为与现状完全一致。

## 3. web 管理端

- `web/src/api/userChannel.js`（新增，照抄 `role.js` 风格）：`getList(userId)`、`assign(userId, channelIds)`。
- `web/src/store/modules/userChannel.js`（新增，照抄 `role.js` store 模块风格）。
- `web/src/views/user/index.vue`：操作列在"管理ApiKey"后新增"分配设备"按钮；admin 角色用户行（`row.role.id === 1`）不显示该按钮（管理员默认全量）。
- `web/src/views/user/dialog/assignDevice.vue`（新增，参考 `addUser.vue` 弹窗骨架）：
  - 数据源：`web/src/api/device.js` 现有设备列表 + 各设备通道列表接口分页拉取（通道总量大时弹窗内按设备懒加载通道）；
  - 树形结构用 el-table 分组或 el-tree 勾选均可，MVP 用 **el-tree（设备为父节点、通道为子节点，checkbox，仅叶子可勾选）**，弹窗打开时已关联通道回显勾选；
  - 保存：收集勾选叶子 channelId 列表 → 调 assign 接口（全量覆盖）→ 成功 message + 关闭。
- 大屏 visual/ 无改动。

## 4. 数据流

```
管理员配置：web 用户管理 → assignDevice 弹窗 → POST /api/user/channel/assign
        → UserChannelController（roleId==1 校验）→ UserChannelService（delete+batchAdd）

大屏查询：visual 登录（bigscreen-auth 已有 JWT）→ GET /api/device/query/devices
        → DeviceQuery → DeviceServiceImpl.getAll（注入过滤：非管理员 → IN 关联设备ID）
        → GET /api/device/query/devices/{deviceId}/channels
        → queryChannelsByDeviceId（注入过滤：非管理员 → IN 关联通道库主键ID）
```

## 5. 兼容与回滚

- 新增表 + 新增接口 + 既有方法新增可选参数（默认 null），对既有调用方零影响；管理员路径行为不变。
- 回滚 = 还原代码 + drop 新表，无存量数据迁移。

## 6. 风险

- `DeviceChannelProvider.queryChannels` 是多调用方共用 SQL，新增 `channelDbIds` 分支需保证 null 时零改动（与现有 channelIds 分支同模式，风险低）。
- 通道库主键 vs 国标编号两套 ID 易混：代码中统一以 `channelDbId` / `channelId（主键）` 命名并在注释中明确。
- 未关联的非管理员用户设备列表为空：属于 PRD 既定行为。
