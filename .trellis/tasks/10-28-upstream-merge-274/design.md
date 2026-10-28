# 技术设计：上游合并（2.7.4 基线）

## 1. 边界与不变量

### 1.1 版本与分支不变量

| 项 | 合并前 | 合并后（目标） |
|---|---|---|
| `pom.xml` `<version>` | `2.7.4` | **`2.7.4`**（不跟随上游 3.0.0） |
| `数据库/2.7.4/` | 2.7.4 建库/升级脚本 | 补齐后的 2.7.4（见 §3） |
| `数据库/3.0.0/` | 不存在 | 随合并进入，**仅作参考，不作建库入口** |
| 分支 | `main` | `main` → `update/upstream-274` → 验证后合回 `main` |
| 远程 | `源码` 只读 / `二开` 可写 | 不变 |

### 1.2 必须保持的二开能力（合并后逐项回归）

1. 通道显示级权限过滤（`wvp_user_channel` + `UserChannelMapper` + `IUserChannelService`）
2. 非管理员菜单白名单（`web/src/utils/auth.js` 的 `RoleKey` 系列 + `Sidebar/index.vue`）
3. `visual/` 大屏与 `demo/` 示例（独立工程，不受合并影响，但依赖后端接口语义）
4. `script/` 部署体系（上游无此目录，合并不触碰）
5. `.trellis/` 工作流与 `.claude/` 配置（上游无此目录，合并不触碰）

## 2. 冲突解决设计

### 2.1 `AGENTS.md`（add/add）

- **冲突性质**：merge-base 无此文件；本地是 21 行纯 Trellis 块，上游是 50 行项目说明。
- **设计**：文件结构 = `<!-- TRELLIS:START -->…<!-- TRELLIS:END -->` 块（置顶，原样保留） + 空行 + 上游正文（原样）。
- **理由**：Trellis 只覆盖标记块内内容，上游正文放在块外不会被 `trellis update` 抹掉；两者信息互补（一个是 AI 工作流，一个是项目架构约定）。
- **注意**：上游正文引用了 `doc/编程规范.md`，该文件会随合并进入（当前本地缺失）。

### 2.2 `README.md`

- **冲突性质**：本地一次提交删除 132 行（公众号、付费社群、截图表格等），上游后续又新增 3 行。
- **设计**：保留本地版本（`git checkout --ours`），不手工合并。
- **理由**：本地删除是有意的品牌/联系方式调整；上游新增的 3 行属于项目介绍，丢失不影响功能。若后续需要可单独 cherry-pick。

### 2.3 `InviteStreamServiceImpl.java`

这是唯一有**语义风险**的冲突。

| | 本地（二开） | 上游 |
|---|---|---|
| 回调容器 | `inviteErrorCallbackMap` (`Map<String, List<ErrorCallback>>`) | `inviteCallbackMap` (`Map<String, InviteCallbackHolder>`) |
| key 构造 | `buildSubStreamKey(...)` | `buildKey(...)` |
| 僵尸清理 | `inviteKeyCreateTimeMap` + `@Scheduled(5000) cleanStaleInviteKeys` | `InviteCallbackHolder.createTime` + `cleanExpiredInviteCallbacks`（在 `@Scheduled(10000)` 的 `execute()` 内） |
| 根因修复 | 无 | 上游 `b20d048b4` + `DynamicTask.stop` 修复 future 残留 |

- **设计**：**全采上游**。冲突 hunk 选 theirs；同时手工删除冲突区外的本地残留：
  - 字段 `inviteKeyCreateTimeMap`（约 L42）
  - `put` / `putIfAbsent` 写入点（约 L265、L276）
  - `remove` 调用点（约 L327）
  - 整个 `cleanStaleInviteKeys()` 方法及其 `@Scheduled` 注解（约 L386-410）
  - `buildSubStreamKey` 方法（约 L340）
- **理由**：上游实现是本地清理逻辑的超集，且修掉了根因；保留两份定时清理会重复通知、重复释放。
- **验收**：`git grep` 上述符号零结果 + 编译通过。

### 2.4 数据库更新脚本（2 处冲突）

#### `数据库/2.7.4/更新-mysql-2.7.4.sql`

- merge-base 278 行 → 本地 290 行（+`20260909 wvp_user_channel`）、上游 249 行（−`20260606`）。
- **设计**：保留本地（`--ours`），得到 `20260606` + `20260521` + `20260909` 全部段落。
- **理由**：上游把 `20260606` 移入 3.0.0，若选 theirs 则存量 2.7.4 库失去 `default_password` 迁移；保留本地后即使将来切 3.0.0，`20260606` 也是幂等的（`IF NOT EXISTS`），重复执行无害。

#### `数据库/2.7.4/更新-postgresql-kingbase-2.7.4.sql`

- **设计**：同上，保留本地。

### 2.5 自动合并但需人工复核的文件

| 文件 | 复核点 |
|---|---|
| `RecordPlanServiceImpl.java` | 应同时含本地 `channelDbIds` 重载 + 上游 `getStartTime/getStopTime` |
| `RecordPlanMapper.java` | 应同时含本地 `channelDbIds` 条件 + 上游 `start_time/stop_time` |
| `ServerController.java` | 应同时含上游 `SECRET_MASK` 掩码 + 本地 `IUserChannelService` 统计过滤 |
| `web/src/utils/auth.js` | 应同时含本地 `RoleKey/getRole/setRole/removeRole` + 上游删除的 `console.log` |
| `docker/wvp/wvp/application-docker.yml` | 确认端口/hook 语义未被上游覆盖成不可用状态 |

## 3. 数据库补齐设计（2.7.4 基线）

### 3.1 缺口矩阵（合并后目标状态）

| 脚本 | `default_password` | `wvp_user_channel` | `start_time/stop_time` |
|---|---|---|---|
| `数据库/2.7.4/初始化-mysql` | 上游删除 → **需补回** | 上游无 → **需补回** | 三方均为旧列 → **需改** |
| `数据库/2.7.4/初始化-postgresql-kingbase` | 同上 → **需补回** | 同上 → **需补回** | 同上 → **需改** |
| `数据库/2.7.4/初始化-达梦` | 上游保留 → 无需补 | 上游无 → **需补回** | 同上 → **需改** |
| `数据库/2.7.4/更新-mysql` | 本地保留 → 已有 | 本地保留 → 已有 | **需新增 20261019 段** |
| `数据库/2.7.4/更新-postgresql-kingbase` | 本地保留 → 已有 | 本地保留 → 已有 | **需新增 20261019 段** |
| `数据库/2.7.4/更新-达梦` | 上游无此文件 | 无 | 无（达梦只有初始化） |
| `script/sql/初始化-mysql-2.7.4.sql` | 已有 | 已有 | **需改** + 需保持 `secret varchar(255)` |
| `docker/mysql/db/wvp.sql` | 待确认 | 待确认 | 上游已改为新列 → 若合并后为新列则无需动 |
| `数据库/2.7.4-h2/h2-schema.sql` | 未同步 | 未同步 | 未同步（本次**不处理**，见 Out of Scope） |

### 3.2 迁移写法（复用上游 3.0.0 的幂等模式）

**MySQL**（`数据库/2.7.4/更新-mysql-2.7.4.sql` 追加）：

```sql
/*
* 20261019 录像计划条目表字段改名，避免使用数据库关键字 start / stop
*/
DROP PROCEDURE IF EXISTS `wvp_20261019`;
DELIMITER //
CREATE PROCEDURE `wvp_20261019`()
BEGIN
    IF EXISTS (SELECT column_name FROM information_schema.columns
               WHERE TABLE_SCHEMA = (SELECT DATABASE()) AND table_name = 'wvp_record_plan_item' AND column_name = 'start')
       AND NOT EXISTS (SELECT column_name FROM information_schema.columns
               WHERE TABLE_SCHEMA = (SELECT DATABASE()) AND table_name = 'wvp_record_plan_item' AND column_name = 'start_time')
    THEN
        ALTER TABLE wvp_record_plan_item CHANGE `start` start_time int COMMENT '开始时间（分钟）';
    END IF;
    IF EXISTS (... 'stop') AND NOT EXISTS (... 'stop_time')
    THEN
        ALTER TABLE wvp_record_plan_item CHANGE `stop` stop_time int COMMENT '结束时间（分钟）';
    END IF;
END; //
DELIMITER ;
call wvp_20261019();
DROP PROCEDURE wvp_20261019;
```

**PostgreSQL / Kingbase**：直接用上游 3.0.0 的 `DO $$ … RENAME COLUMN "start" TO start_time … $$` 块（36 行文件，可整段复制）。

**达梦**：只有初始化脚本，直接改建表列名 `start → start_time`、`stop → stop_time`，`COMMENT ON COLUMN` 同步。

### 3.3 建表定义来源

- `wvp_user_channel` 的 MySQL 定义取自本地 `数据库/2.7.4/初始化-mysql`（L542-550，`serial primary key` + `uk_user_channel` 唯一约束）。
- PostgreSQL 版取自本地同名文件对应段。
- 达梦版取自本地 `初始化-达梦`（L1151-1161，`identity(1,1)`）。

### 3.4 现网库兼容性

- 现网库已是 2.7.4 且有 `default_password` / `wvp_user_channel`。
- 只需执行新增的 `20261019` 改名段。
- `20260606` 与 `20260909` 均幂等，重复执行安全。

## 4. 构建与产物联动

```
web/ (Vue2)  ──npm run build:prod──▶  src/main/resources/static/  (gitignored)
                                              │
                                              ▼
                                    mvn clean package
                                              │
                                              ▼
                              target/wvp-pro-2.7.4-<timestamp>.jar
                                              │
                                              ▼
                          手工改名 → script/jar/wvp.jar (gitignored)
```

- `pom.xml` **没有** `frontend-maven-plugin`（`mvn package` 不会构建前端）。
- `pom.xml` 硬编码 `<skipTests>true</skipTests>`（L472），`-DskipTests=false` 无效；但 **test-compile 仍会编译上游新增的 12 个测试**，解冲突不彻底会在该阶段暴露。
- 由于保持 2.7.4，jar 名仍是 `wvp-pro-2.7.4-<timestamp>.jar`，无需改 Dockerfile/compose。

## 5. 回滚设计

| 阶段 | 回滚方式 |
|---|---|
| 合并冲突未解决 | `git merge --abort` |
| 冲突已解决但编译失败 | `git reset --hard main` 后重来 |
| 已提交到 `update/upstream-274` 但验证失败 | `git checkout main` + `git branch -D update/upstream-274` |
| 已合回 `main` 但未 push | `git reset --hard <合并前 main 的 SHA>` |
| 已 push 到 `二开` | `git revert -m 1 <merge-commit>` 新提交（不改写历史） |

**合并前的 `main` SHA 记录为回滚锚点**（当前 `7aa66b5c7`）。

## 6. 风险与权衡

| 风险 | 影响 | 缓解 |
|---|---|---|
| 上游 3.0.0 带来的字段/接口语义变化超出 SQL 范围 | 运行时错误 | 只合代码不合版本号，逐项核对 `RecordPlan*`、`CloudRecordSession*`、`UserSetting` 新字段 |
| 上游新增 12 个测试依赖新架构 | test-compile 失败 | 解冲突时彻底删除本地旧符号 |
| 前端未重建 | jar 内旧资源，录像计划被清空 | 构建顺序强制：先 `npm run build:prod` 再 `mvn package`，并校验 `static` 产物时间戳 |
| `script/sql` 是部署实际挂载的副本 | 部署环境建库缺列/缺表 | 与 `数据库/2.7.4` 同步并 diff 校验 |
| 上游新提交（fetch 后） | 预演失效 | fetch 后重跑 `git merge-tree` 预演再动手 |

## 7. 明确不做

- 不升级 `pom.xml` 到 3.0.0。
- 不把 `数据库/3.0.0/` 作为建库入口。
- 不同步 `数据库/2.7.4-h2/h2-schema.sql`（H2 仅测试用，本地与上游都未维护）。
- 不改 `script/` 部署体系结构。
- 不动 `visual/`、`demo/`。
- 不处理明文凭据问题（属既有安全债，单独任务）。
- 不清理残留 worktree 与未跟踪文件（属后续 c 项）。
