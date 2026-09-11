# 实施计划：用户关联设备（通道）分配与查询过滤

执行顺序：数据库 → 后端 → web 前端 → 验证。每步含验证命令，任一步失败先修复再继续。

## Step 1：数据库脚本

- [ ] `script/sql/初始化-mysql-2.7.4.sql` 末尾（wvp_user 相关表区域附近）新增 `wvp_user_channel` 建表 + 唯一索引（见 design.md §1）。
- [ ] `数据库/2.7.4/` 下 mysql / postgresql-kingbase / 达梦脚本同步新增（照各库现有语法风格）。
- 验证：人工 review SQL 语法与现有表风格一致。

## Step 2：后端 Mapper + Service + Controller

- [ ] 新增 `src/main/java/com/genersoft/iot/vmp/storager/dao/UserChannelMapper.java`（方法清单见 design.md §2.1，风格参考 `RoleMapper`、`DeviceChannelMapper`）。
- [ ] 新增 `src/main/java/com/genersoft/iot/vmp/service/IUserChannelService.java` 与 `service/impl/UserChannelServiceImpl.java`（方法清单见 design.md §2.2；`isFilterNeeded()` 封装角色判断，`SecurityUtils.getUserInfo()` 为 null 或 roleId==1 时返回 false）。
- [ ] 新增 `src/main/java/com/genersoft/iot/vmp/vmanager/user/UserChannelController.java`（`/api/user/channel/list`、`/api/user/channel/assign`，鉴权照抄 `RoleController` 的 roleId==1 模式，Swagger 注解齐全）。
- 验证：`mvn -q compile`（或 `mvn -q -DskipTests compile`）通过。

## Step 3：查询过滤注入（后端核心）

- [ ] `DeviceChannelProvider.queryChannels`（`gb28181/dao/provider/DeviceChannelProvider.java:64`）新增 `channelDbIds`（库主键 List<Integer>）分支 `AND dc.id in (...)`，null 时不拼接。
- [ ] `DeviceChannelMapper.queryChannels`（`gb28181/dao/DeviceChannelMapper.java:94`）新增参数 `@Param("channelDbIds") List<Integer> channelDbIds`；其余调用方全部补传 null。
- [ ] `IDeviceChannelService.queryChannelsByDeviceId` 及 impl（`DeviceChannelServiceImpl.java:492`）新增可选 `channelDbIds` 透传；调用点 `DeviceQuery.channels()`（`DeviceQuery.java:106`）：非管理员时从 `UserChannelService` 取当前用户关联 channelDbIds 传入。
- [ ] 设备列表过滤：`DeviceServiceImpl.getAll(page,count,query,status)`（`DeviceServiceImpl.java:955`）路径注入 `deviceDbIds`（新增重载或 provider 分支，方式与通道过滤对齐）；调用点 `DeviceQuery.devices()`（`DeviceQuery.java:88`）。
- [ ] 确认过滤条件进了 PageHelper 分页 SQL（参数传 mapper，禁止内存过滤）。
- 验证：`mvn -q compile` 通过；grep 确认 `queryChannels` 所有调用点无遗漏编译错误（编译器保证）。

## Step 4：web 管理端

- [ ] 新增 `web/src/api/userChannel.js`（getList / assign）。
- [ ] 新增 `web/src/store/modules/userChannel.js`。
- [ ] `web/src/views/user/index.vue` 操作列加"分配设备"按钮（admin 行不显示，判断 `row.role.id === 1`）。
- [ ] 新增 `web/src/views/user/dialog/assignDevice.vue`：el-tree（设备→通道，仅叶子勾选），打开时加载设备+通道（复用 `web/src/api/device.js` 既有接口）+ 已关联回显，保存全量覆盖提交。
- 验证：`cd web && npm run build:prod`（或现有 build 脚本）通过。

## Step 6：部署到 wvp2（script/ 体系，经 192.168.1.100 SSH）

部署拓扑（来自记忆 wvp-deploy-topology）：`ssh root@192.168.1.100`（密钥认证）实际落到 172.29.205.39 的 `/home/docker/wvp2/`，容器 wvp-main / wvp-mysql / wvp-redis / zlmediakit。

- [ ] 6.1 构建 web 前端：`cd web && npm run build:prod`（outputDir 指向 `../src/main/resources/static`，即打进 jar）。
- [ ] 6.2 构建后端 jar：`mvn -q -DskipTests package`（wvp.jar 自带前端）。
- [ ] 6.3 上传并重启：
  ```bash
  scp script/jar/wvp.jar root@192.168.1.100:/home/docker/wvp2/jar/wvp.jar
  ssh root@192.168.1.100 "cd /home/docker/wvp2 && docker compose restart wvp && docker compose restart zlmediakit"
  ```
  注意：**重启 wvp 后必须再单独 restart zlmediakit**（README 踩坑第 9 条：WVP 冷启动热更新 hook 令 ZLM keepalive 失效）。只改 jar 用 `restart wvp`，不要 `up -d --build`。
- [ ] 6.4 新建表：MySQL 已有存量数据，init.sql 只在首次建库执行。需手动执行建表：
  ```bash
  ssh root@192.168.1.100 "docker exec -i wvp-mysql mysql -uwvp -p'Wvp@2026!mysql' wvp2" < <(wvp_user_channel 建表语句)
  ```
  （或本地导出 SQL 文件后 scp + docker exec 执行。）
- [ ] 6.5 部署后验证：`docker logs -f wvp-main` 出现 `Started VManageBootstrap`；doc.html 可看到"用户通道分配"新接口；ZLM hook 检查（getServerConfig 确认 hook.on_publish 仍在）。

## Step 7：端到端验证（MCP 浏览器，部署后）

访问 `http://192.168.1.100:18080`，用 chrome-devtools MCP 驱动浏览器完成 PRD 验收标准 1-4：

- [ ] admin 登录 web → 用户管理 → 为测试用户分配 2 个通道 → 保存成功。
- [ ] 用测试用户登录大屏 → 设备列表只含关联设备，通道列表只含关联通道，播放正常。
- [ ] 用 admin 登录大屏 → 全量可见。
- [ ] 未关联用户登录大屏 → 设备列表为空。
- 回归：admin 在 web 端设备/通道页浏览正常（管理员不过滤）。

## Step 8：收尾

- [ ] 运行 trellis-check 质量检查（Agent 形式）。
- [ ] 按需更新 spec（trellis-update-spec，如沉淀"channelId 两套 ID"约定）。
- [ ] 等用户确认后由用户提交（不主动 commit）。

## 回滚点

- Step 1-3 各自独立可编译；Step 3 失败可回退过滤注入（参数全部为 null 兼容）。
- 全量回滚：还原代码 + `drop table wvp_user_channel`。
