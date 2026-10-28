# 执行计划：3.0.0 基线切换

## 前置

- 当前分支 `main`，工作区 clean。
- 任务：`.trellis/tasks/10-28-upgrade-baseline-300`
- 无外部依赖，全部为本地文件改动。

## 执行清单

### P1 pom 版本（1 处）

- [ ] 1.1 `pom.xml:14` `<version>2.7.4</version>` → `<version>3.0.0</version>`
- [ ] 1.2 验证：`git diff pom.xml` 只有这一行；`grep -m1 '<version>' pom.xml` 输出 3.0.0

### P2 三方言初始化脚本补表（3 个文件，均追加到文件末尾）

参照 `数据库/2.7.4/` 的同方言写法，**逐方言独立**，不跨复制。

- [ ] 2.1 `数据库/3.0.0/初始化-mysql-3.0.0.sql`
  追加：注释行 + `drop table IF EXISTS wvp_user_channel;` + 建表（`serial primary key COMMENT '主键ID'`，`constraint uk_user_channel unique (user_id, channel_id)`）。
- [ ] 2.2 `数据库/3.0.0/初始化-postgresql-kingbase-3.0.0.sql`
  追加：注释行 + `drop table IF EXISTS ...` + 建表（`serial primary key`）+ 5 行 `COMMENT ON` + `create unique index IF NOT EXISTS uk_user_channel on wvp_user_channel (user_id, channel_id);`
- [ ] 2.3 `数据库/3.0.0/初始化-达梦-3.0.0.sql`
  追加：注释行 + `DECLARE V_CNT INT; BEGIN SELECT COUNT(*) INTO V_CNT FROM SYSOBJECTS WHERE NAME = 'WVP_USER_CHANNEL' AND TYPE$ = 'SCHOBJ'; IF V_CNT > 0 THEN EXECUTE IMMEDIATE 'DROP TABLE WVP_USER_CHANNEL'; END IF; END; /` + 建表（`int identity(1,1) primary key`）+ 5 行 `COMMENT ON` + `CREATE UNIQUE INDEX uk_user_channel ON wvp_user_channel (user_id, channel_id);`
- [ ] 2.4 验证：`grep -c wvp_user_channel 数据库/3.0.0/初始化-*.sql` 均 ≥ 1

### P3 两份更新脚本补段（2 个文件，追加到末尾）

- [ ] 3.1 `数据库/3.0.0/更新-mysql-3.0.0.sql`
  追加 `/* 20260909 添加用户通道关联表 */` + `create table IF NOT EXISTS wvp_user_channel (...)`（同 2.1 的列定义）。不需要存储过程。
- [ ] 3.2 `数据库/3.0.0/更新-postgresql-kingbase-3.0.0.sql`
  追加同段：`create table IF NOT EXISTS` + `COMMENT ON` × 5 + `create unique index IF NOT EXISTS`。
- [ ] 3.3 验证：`grep -c wvp_user_channel 数据库/3.0.0/更新-*.sql` 均 ≥ 1

### P4 docker 部署链路改指 3.0.0（3 个文件 + 1 个新文件）

- [ ] 4.1 新建 `script/sql/初始化-mysql-3.0.0.sql`：内容 = P2.1 完成后的 `数据库/3.0.0/初始化-mysql-3.0.0.sql`，再套用本地 `secret` 加宽修正（`wvp_media_server.secret` 的 `character varying(50)` → `character varying(255)`）。
- [ ] 4.2 `docker/docker-compose.yml:48` 挂载路径 `../数据库/2.7.4/初始化-mysql-2.7.4.sql` → `../数据库/3.0.0/初始化-mysql-3.0.0.sql`
- [ ] 4.3 `script/docker-compose.yml:20` 挂载路径 `./sql/初始化-mysql-2.7.4.sql` → `./sql/初始化-mysql-3.0.0.sql`
- [ ] 4.4 `script/README.md:15` 目录树中的 `sql/初始化-mysql-2.7.4.sql` → `sql/初始化-mysql-3.0.0.sql`
- [ ] 4.5 验证：`test -f` 两个被挂载的文件均存在；`grep -n "初始化-mysql" docker/docker-compose.yml script/docker-compose.yml`
- [ ] 4.6 在 `script/README.md` 补一句：已有数据卷不会自动重建，切换需清空 `mysql/data` 或手工执行 update 脚本。

### P5 文档同步（2 个文件）

- [ ] 5.1 `.trellis/spec/wvp-pro/backend/deployment-runbook.md`
  - `:97` `wvp-pro-2.7.4-<MMddHHmm>.jar` → `wvp-pro-3.0.0-<MMddHHmm>.jar`
  - `:99` 「版本号固定 2.7.4（pom.xml 不跟随上游 3.0.0）」→ 3.0.0 基线表述
  - `:107` 自检脚本中的 jar 名
  - `:140` scp 源文件名
  - `:260` 「构建版本： 2.7.4」→ 3.0.0
  - `:360` 故障排查「新装库缺 wvp_user_channel / default_password」的处置改为指向 3.0.0 脚本
  - `:361` 删除「构建产物名是 wvp-pro-3.0.0-* → 改回 2.7.4」这条（新基线下不成立）
- [ ] 5.2 `.trellis/spec/wvp-pro/backend/database-guidelines.md`
  删除/改写「已知脚本缺口」段中关于 `wvp_user_channel` 在 `数据库/3.0.0/` 缺失的描述。
- [ ] 5.3 验证：`grep -rn "2\.7\.4" .trellis/spec/wvp-pro/backend/deployment-runbook.md` 剩余项均为历史/存量库语境

### P6 构建与验证

- [ ] 6.1 `mvn help:evaluate -Dexpression=project.version -q -DforceStdout` → `3.0.0`
- [ ] 6.2 `mvn -q -DskipTests compile` 通过（注意 pom 硬编码 skipTests，`-DskipTests=false` 无效）
- [ ] 6.3 MySQL init 实跑验证（若本机有可用 MySQL/Docker）：
  `docker run --rm -v "$PWD/数据库/3.0.0/初始化-mysql-3.0.0.sql:/tmp/init.sql:ro" mysql:8 bash -c "..."`，
  或本地 MySQL 建空库后 `source` 执行。验证 `SHOW CREATE TABLE wvp_user_channel`。
  若无法执行，在交付说明中标注「未实跑」。
- [ ] 6.4 更新脚本幂等验证（MySQL）：对同一库连续执行两次 3.0.0 update，第二次无报错。
- [ ] 6.5 PG/Kingbase/达梦：与 2.7.4 已上线脚本逐行 diff，确认字段、约束名、注释一致。标注「未实跑」。

### P7 收尾

- [ ] 7.1 `git status` 确认无 `$null`、无 `.bak`、无 `文档/`、无明文配置变更
- [ ] 7.2 `git diff --stat` 复核改动范围，确认只涉及 P1–P5 列出的文件
- [ ] 7.3 交付说明中列出：已验证项、未验证项（PG/Kingbase/达梦实跑）、需运维手工处理项（存量库迁移）

## 验证命令汇总

```bash
# P1
grep -m1 '<version>' pom.xml && git diff --stat pom.xml

# P2/P3
grep -c wvp_user_channel 数据库/3.0.0/初始化-mysql-3.0.0.sql \
                          数据库/3.0.0/初始化-postgresql-kingbase-3.0.0.sql \
                          数据库/3.0.0/初始化-达梦-3.0.0.sql \
                          数据库/3.0.0/更新-mysql-3.0.0.sql \
                          数据库/3.0.0/更新-postgresql-kingbase-3.0.0.sql

# P4
test -f 数据库/3.0.0/初始化-mysql-3.0.0.sql && test -f script/sql/初始化-mysql-3.0.0.sql
grep -n "初始化-mysql" docker/docker-compose.yml script/docker-compose.yml
grep -n "secret.*varying(255)" script/sql/初始化-mysql-3.0.0.sql

# P6
mvn help:evaluate -Dexpression=project.version -q -DforceStdout
mvn -q -DskipTests compile
ls target/wvp-pro-3.0.0-*.jar 2>/dev/null || echo "未打包（compile 不产出 jar）"
```

## 回滚点

| 阶段 | 回滚方式 |
|---|---|
| P1 后 | `git checkout -- pom.xml` |
| P2–P3 后 | `git checkout -- 数据库/3.0.0/` |
| P4 后 | `git checkout -- docker/docker-compose.yml script/`；删除新增 SQL 副本 |
| P5 后 | `git checkout -- .trellis/spec/` |

全部为本地文件改动，无数据库变更、无远程推送。

## 顺序说明

P2 必须先于 P4.1（副本从 P2.1 的成品复制）。其余阶段相互独立，P6 依赖 P1–P5 全部完成。
