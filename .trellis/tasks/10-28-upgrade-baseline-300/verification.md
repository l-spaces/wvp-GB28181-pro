# 验证记录：2026-10-28 本地环境实跑

## 部署目标

| 项 | 值 |
|---|---|
| 服务器 | 本地环境（192.168.1.100，实际为 WSL2，主机名 CY-PC） |
| 部署目录 | `/home/docker/wvp2` |
| 部署方式 | `docker compose`，4 容器（wvp / mysql / redis / zlmediakit） |
| 数据库 | `wvp2`，MySQL 8.4.9，数据目录 215M 存量 |

## 执行过程

1. 备份：`jar/wvp.jar`、`zlm/config.ini`、`docker-compose.yml` → `.bak-202610281632`；`mysqldump` → `mysql/backup-202610281632.sql`（84K）
2. 上传 `wvp-pro-3.0.0-10280831.jar` → `jar/wvp.jar.new`，`sql/初始化-mysql-3.0.0.sql` → `sql/`，`docker-compose.yml.new`
3. **只**改 compose 的 SQL 挂载行（远端定制项 `30000-30060` 端口段保留，未覆盖）
4. 替换 jar → `docker compose up -d wvp`（MySQL 因 compose 变更被重建，数据卷保留）
5. v1 启动后发现 WVP 未随 jar 替换自动重启，补 `docker compose restart wvp`
6. 按手册规程补 `docker compose restart zlmediakit`

## 验证结果

### 构建产物

| 项 | 结果 |
|---|---|
| jar 名 | `wvp-pro-3.0.0-10280831.jar`（135,976,614 B） |
| `git.build.version` | `3.0.0` ✅ |
| `static` 条目数 | 134（非 0，前端已打入）✅ |
| `mvn -DskipTests compile` | BUILD SUCCESS（783 源文件）✅ |
| `mvn -DskipTests package` | BUILD SUCCESS ✅ |

### 运行时

| 项 | 结果 |
|---|---|
| 启动日志 | `构建版本： 3.0.0`、`构建时间：2026-10-28T16:30:26+08:00` ✅ |
| Tomcat | `started on port 18080` ✅ |
| 启动耗时 | 8.367 秒 ✅ |
| `/api/server/version` | `"version":"3.0.0"` ✅ |
| 容器状态 | 4 容器全部 Up，mysql/redis healthy ✅ |
| ZLM 心跳 | 重启后无超时告警 ✅ |
| 错误日志（稳定后 60s） | 无（排除 SSRC 重建的历史噪音）✅ |

### 功能接口

| 接口 | 结果 |
|---|---|
| `GET /`（首页） | HTTP 200，7545 B ✅ |
| `/static/js/app.ddd10f24.js` | 200，162 KB ✅ |
| `/static/css/app.6fc4c86a.css` | 200，34.9 KB ✅ |
| `/api/user/login`（MD5 入参） | code 0，返回 accessToken ✅ |
| `/api/device/query/devices` | code 0，total=1（存量设备数据完好）✅ |
| `/api/user/all` | code 0 ✅ |
| `/api/user/channel/list?userId=1` | code 0，`[]`（**表存在，无报表不存在错误**）✅ |
| `/api/record/plan/query` | code 0，total=1（**`start_time` 列查询正常**）✅ |
| `/api/server/media_server/list` | code 0，ZLM 配置正确 ✅ |
| `/api/server/system/configInfo` | code 0 ✅ |

### 数据库现状（部署前已达标）

| 检查项 | 结果 |
|---|---|
| `wvp_user_channel` 表 | 存在（AUTO_INCREMENT=18，有 17 条关联数据） |
| `wvp_user.default_password` 列 | 存在 |
| `wvp_record_plan_item.start_time` 列 | 存在（旧 `start` 列已不存在） |
| `wvp_media_server.secret` 列宽 | `varchar(255)` |

存量库此前已通过 `数据库/2.7.4/更新-*` 完成迁移，本次切 3.0.0 基线**无需再执行迁移**。

## 未验证项（明确声明）

| 项 | 原因 |
|---|---|
| `数据库/3.0.0/初始化-mysql-3.0.0.sql` 全量实跑 | 需要空库；线上库有存量数据，不可清空。本机 Docker daemon 未运行、无 mysql 客户端 |
| PostgreSQL / Kingbase init 实跑 | 无环境 |
| 达梦 init 实跑 | 无环境 |
| 两方言 update 脚本实跑 | 无环境 |

替代验证：三个方言的 `wvp_user_channel` 段已与 `数据库/2.7.4/` 中**已上线运行**的同结构脚本逐行 diff，结果完全一致（MySQL / PG / 达梦均无差异）。

## 部署中发现的问题

1. **jar 替换后 WVP 不会自动重启**：`docker compose up -d wvp` 只重建了 mysql（compose 变更触发），wvp 容器因镜像未变化保持原状，必须显式 `docker compose restart wvp`。手册 §3.4 应补充这一点。
2. **MySQL 容器被重建**：compose 挂载变更导致 `Recreate`，但数据卷 `mysql/data` 保留，数据无损。若挂载路径写错，MySQL 会以空库启动并执行 init 脚本——需在部署前确认。
3. 登录接口要求 **32 位 MD5**，不是明文密码（手册未写明）。

## 回滚点

- jar：`jar/wvp.jar.bak-202610281632`
- compose：`docker-compose.yml.bak-202610281632`
- zlm 配置：`zlm/config.ini.bak-202610281632`
- 数据库：`mysql/backup-202610281632.sql`
