# 升级基线到 3.0.0 并补齐用户通道表脚本

## Goal

把 `pom.xml` 版本号从 `2.7.4` 改为 `3.0.0`，并在 `数据库/3.0.0/` 的三方言初始化脚本与两份更新脚本中补齐二开独有的 `wvp_user_channel` 表；同步让 docker 部署链路指向 3.0.0 建库脚本，并更新部署手册中的版本判据。

## 背景

上游 `源码/master` 已是 `3.0.0`，本地为了保持 2.7.4 数据库基线而把 `pom.xml` 改回了 `2.7.4`（见归档任务 `10-28-upstream-merge-274`）。现在决定把基线正式切到 3.0.0，使版本声明与实际建库脚本一致。

`wvp_user_channel` 是二开独有的表（用户-通道显示级权限过滤），上游 3.0.0 的 5 个脚本全部缺失。`storager/dao/UserChannelMapper` 依赖它，用 3.0.0 脚本建库后相关接口会失败。

## Requirements

### R1 pom 版本

- `pom.xml` `<version>` 由 `2.7.4` 改为 `3.0.0`。
- 不修改其他 pom 内容（依赖、插件均不动）。

### R2 补齐 `数据库/3.0.0/` 的 `wvp_user_channel`

必须按各脚本既有方言写法补齐，**不得跨方言复制**：

| 文件 | 动作 |
|---|---|
| `初始化-mysql-3.0.0.sql` | 末尾追加建表（`serial primary key` + `constraint uk_user_channel unique`），与 `初始化-mysql-2.7.4.sql` 的写法一致 |
| `初始化-postgresql-kingbase-3.0.0.sql` | 末尾追加建表（`serial primary key` + `COMMENT ON` + `create unique index IF NOT EXISTS uk_user_channel`） |
| `初始化-达梦-3.0.0.sql` | 末尾追加建表（`int identity(1,1) primary key` + `COMMENT ON` + `CREATE UNIQUE INDEX uk_user_channel`） |
| `更新-mysql-3.0.0.sql` | 追加 `wvp_20260909` 段：幂等建表（`create table IF NOT EXISTS`） |
| `更新-postgresql-kingbase-3.0.0.sql` | 追加同名段：`create table IF NOT EXISTS` + `COMMENT ON` + `create unique index IF NOT EXISTS` |

- 达梦无更新脚本（上游与 2.7.4 均无），**不新建** `更新-达梦-3.0.0.sql`。
- 建表字段固定为：`id`、`user_id`（NOT NULL）、`channel_id`（NOT NULL）、`create_time`（NOT NULL）。

### R3 docker 部署链路改指 3.0.0

- `docker/docker-compose.yml`：mysql 挂载的建库脚本由 `../数据库/2.7.4/初始化-mysql-2.7.4.sql` 改为 `../数据库/3.0.0/初始化-mysql-3.0.0.sql`。
- `script/sql/` 新增 `初始化-mysql-3.0.0.sql` 冻结副本，内容 = `数据库/3.0.0/初始化-mysql-3.0.0.sql` + 本地已有的 `wvp_media_server.secret` 加宽修正（`character varying(50)` → `character varying(255)`）。
- `script/docker-compose.yml`：挂载由 `./sql/初始化-mysql-2.7.4.sql` 改为 `./sql/初始化-mysql-3.0.0.sql`。
- `script/README.md` 中目录树与 `secret` 说明同步到新文件名。

### R4 保留 2.7.4 目录

- `数据库/2.7.4/`、`数据库/2.7.4-h2/`、`script/sql/初始化-mysql-2.7.4.sql` 全部保留不动。
- 存量库升级路径：先用 `数据库/2.7.4/更新-*` 补齐当前结构，再用 `数据库/3.0.0/更新-*` 升级。

### R5 文档同步

- `.trellis/spec/wvp-pro/backend/deployment-runbook.md`：
  - `:97`、`:107`、`:140` 的产物名示例改为 `wvp-pro-3.0.0-<MMddHHmm>.jar`。
  - `:99` 的「版本号固定 2.7.4（pom.xml 不跟随上游 3.0.0）」改为 3.0.0 基线表述。
  - `:361` 的故障排查条目（「构建产物名是 wvp-pro-3.0.0-* → 改回 2.7.4」）改为新基线下无此问题或改写判据。
  - `:260` 的「构建版本：2.7.4」改为 3.0.0。
- `.trellis/spec/wvp-pro/backend/database-guidelines.md`：删除「已知脚本缺口」中关于 `wvp_user_channel` 在 3.0.0 缺失的描述。

## Constraints

- 不扩大范围：不做与版本切换无关的重构，不改动二开业务代码（用户通道权限功能）。
- 不改动 `数据库/2.7.4/`、`数据库/2.7.4-h2/`、`docker/mysql/db/wvp.sql` 的内容。
- 不修改上游脚本的既有方言风格与注释语言。
- 不主动 commit / push。
- 达梦与 kingbase 无可用环境，只能靠与 2.7.4 已上线脚本的结构比对来保证正确性；这一点必须在交付说明中明确。

## Acceptance Criteria

- [x] AC1 `grep -m1 '<version>' pom.xml` 显示 `3.0.0`，且 pom 无其他改动（`git diff pom.xml` 只有 version 一行）。
- [x] AC2 五个 3.0.0 脚本均含 `wvp_user_channel`：`grep -c wvp_user_channel 数据库/3.0.0/初始化-*.sql 数据库/3.0.0/更新-*.sql` 每个文件 ≥ 1。
- [x] AC3 三个 init 脚本的用户通道表字段（`id`/`user_id`/`channel_id`/`create_time`）与 `数据库/2.7.4/` 同方言版本逐字段一致，唯一约束名均为 `uk_user_channel`。
- [x] AC4 **部分达成**：3.0.0 脚本本身**未在真实库执行**（线上库有存量数据不可清空，本机无空库环境）。
  已做替代验证：① 与 `数据库/2.7.4/` 中已上线运行的同结构脚本逐行 diff，三方言完全一致；
  ② H2 MySQL/PG 模式各跑两次，验证 `create table IF NOT EXISTS` 与 `create unique index IF NOT EXISTS` 幂等；
  ③ 部署验证确认**存量库**（此前已由 2.7.4 更新脚本迁移）在 3.0.0 代码下接口全部正常。
  详见 `verification.md` 的「未验证项」。
- [x] AC5 `docker/docker-compose.yml` 与 `script/docker-compose.yml` 的挂载路径指向存在的文件。
- [x] AC6 `script/sql/初始化-mysql-3.0.0.sql` 存在，且 `secret` 列为 `character varying(255)`。
- [x] AC7 `mvn -DskipTests compile` 与 `package` 均通过，产物 `target/wvp-pro-3.0.0-10280831.jar`，`git.build.version=3.0.0`。
- [x] AC8 `grep -rn "wvp_user_channel" 数据库/3.0.0/` 覆盖三方言 init + 两份 update。
- [x] AC9 部署手册与数据库规范中不再出现「pom 固定 2.7.4」「3.0.0 缺 wvp_user_channel」的过时断言。

## 部署验证

已在「本地环境」（192.168.1.100 / WSL2）完成实际部署并验证，详见 [`verification.md`](./verification.md)。

## Open Questions

- 达梦与 kingbase 实际执行验证无法在本地完成，是否接受「结构比对 + 语法评审」作为验证标准？
