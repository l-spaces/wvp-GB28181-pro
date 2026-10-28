# 技术设计：3.0.0 基线切换与 wvp_user_channel 脚本补齐

## 1. 影响面

### 1.1 版本号链路（已核实）

`pom.xml` 的 `<version>` 只有两条下游影响，**均不涉及编译与运行逻辑**：

| 下游 | 位置 | 影响 |
|---|---|---|
| 产物名 | `pom.xml:418` `<finalName>${project.artifactId}-${project.version}-${maven.build.timestamp}</finalName>` | jar 名由 `wvp-pro-2.7.4-<ts>.jar` 变为 `wvp-pro-3.0.0-<ts>.jar` |
| 构建版本 | `git-commit-id-maven-plugin` → `target/classes/git.properties` → `GitUtil.buildVersion` → `/api/server/version` | 平台信息接口显示 3.0.0 |

已确认**无**以下风险：

- `src/main/java` 中无任何按版本号分支的逻辑（`grep '"2\.7\.4"\|"3\.0\.0"'` 无结果）。
- `docker/wvp/Dockerfile:61` 用 `mv wvp-pro-*.jar wvp.jar` 通配，不依赖版本号。
- `script/jar/Dockerfile:7` 用 `COPY wvp.jar`，部署前已重命名。
- `.github/workflows/build.yml:6` 的 `v*.*.*` 只是 tag 触发模式。

需要手工同步的硬编码：

- `bin/wvp.sh:44` `AppName=wvp-pro-2.7.2-05131055.jar`
- `run.sh:44` `AppName=wvp-pro-2.7.18-11211115.jar`
- 两者上游同样过时，**本次不改**（不在范围内，且不是本次引入）。

### 1.2 数据库脚本矩阵

| 版本 | mysql init | pg/kingbase init | 达梦 init | mysql update | pg update | 达梦 update |
|---|---|---|---|---|---|---|
| 2.7.4（本地已补） | ✅ 有 wvp_user_channel | ✅ | ✅ | ✅ `wvp_20260909` | ✅ | ❌ 不存在 |
| 3.0.0（上游，现状） | ❌ 缺 | ❌ 缺 | ❌ 缺 | ❌ 缺 | ❌ 缺 | ❌ 不存在 |
| 3.0.0（本次目标） | ✅ 补 | ✅ 补 | ✅ 补 | ✅ 补 | ✅ 补 | ❌ 不建 |

### 1.3 部署链路

```
docker/docker-compose.yml
  └─ ../数据库/3.0.0/初始化-mysql-3.0.0.sql   ← 改这里

script/docker-compose.yml
  └─ ./sql/初始化-mysql-3.0.0.sql            ← 改这里
       └─ 新文件 = 数据库/3.0.0/初始化-mysql-3.0.0.sql
                 + secret varchar(50) → varchar(255) 的本地修正
```

## 2. 设计决策

### D1 为什么保留 `数据库/2.7.4/`

上游持续维护该目录，删除会在下次 `git fetch 源码 && git merge 源码/master` 时产生 `delete/modify` 冲突。保留也是存量库的升级入口：`2.7.4/更新-*` 先把老库补齐到当前结构，`3.0.0/更新-*` 再升级。

### D2 各方言建表写法必须独立

三种方言的等价写法不同，不能互相复制：

| 方言 | 主键 | 唯一约束 | 注释 |
|---|---|---|---|
| MySQL | `serial primary key COMMENT '主键ID'` | `constraint uk_user_channel unique (user_id, channel_id)` | 列级 `COMMENT` |
| PG/Kingbase | `serial primary key` | `create unique index IF NOT EXISTS uk_user_channel on ...` | 独立 `COMMENT ON TABLE/COLUMN` |
| 达梦 | `int identity(1,1) primary key` | `CREATE UNIQUE INDEX uk_user_channel ON ...` | 独立 `COMMENT ON`；drop 用 `DECLARE ... SYSOBJECTS` 块 |

依据：`数据库/2.7.4/` 的同方言脚本已在实际环境上线，直接对齐它们。

### D3 `wvp_20260909` 段编号沿用 2.7.4 的段名

2.7.4 与 3.0.0 的更新脚本使用同一套 `wvp_<yyyymmdd>` 存储过程命名。3.0.0 已有 `wvp_20260606`、`wvp_20261019`；`wvp_20260909` 在编号上落在两者之间，但**段名只用于 `DROP PROCEDURE` 与 `call` 配对，不要求执行顺序单调**。沿用同名可让两个版本的脚本段一一对应，便于排查。

MySQL 的幂等建表不需要存储过程（`create table IF NOT EXISTS` 本身幂等），2.7.4 的 `wvp_20260909` 段也是这样写的。

### D4 达梦不建 update 脚本

上游与 2.7.4 都只有 `初始化-达梦`，达梦升级路径本就不存在。新建会引入一个无人验证、无上游对应物的文件，属于扩大范围。

## 3. 验证策略

| 项目 | 方式 | 可验证性 |
|---|---|---|
| MySQL init 可执行 | H2 MySQL 兼容模式或 Docker mysql:8 实跑 | 高 |
| PG/Kingbase init | **无法实跑**，与 2.7.4 已上线脚本逐行 diff | 中 |
| 达梦 init | **无法实跑**，同上 | 中 |
| 更新脚本幂等 | 对同一库连续执行两次，第二次应无报错 | 中高（仅 MySQL） |
| pom 产物名 | `mvn help:evaluate -Dexpression=project.version` + `mvn -q -DskipTests compile` | 高 |
| 挂载路径存在性 | `test -f` | 高 |

**未验证项必须写进交付说明**，不能声称「已验证」。

## 4. 回滚

纯增量改动，无破坏性：

- pom 版本回退一行。
- 3.0.0 脚本新增的 `wvp_user_channel` 段可保留（`IF NOT EXISTS` 幂等，不影响上游脚本行为）。
- 新增的 `script/sql/初始化-mysql-3.0.0.sql` 删除文件即可。
- 两处 docker-compose 挂载路径回退一行。

## 5. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 3.0.0 脚本与 2.7.4 之外的上游结构差异未察觉 | 只比对了 `wvp_user_channel`，未全表比对 | 本任务只补该表，不承担全量对齐 |
| 部署手册改动引入错误判据 | 运维按手册排查 | 改动后 grep 复核所有 `2.7.4` 断言 |
| 已有 docker 环境不会自动重建库 | compose 挂载变更只影响首次启动的空数据目录 | 在 README/手册说明需清空 `volumes/mysql/data` 或手工执行 update |
