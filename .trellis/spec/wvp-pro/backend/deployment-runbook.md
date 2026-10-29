# 部署手册（开发机构建 → CY-PC/WSL2 部署）

> 本文补充 [`script/README.md`](../../../../script/README.md) 未覆盖的部分：**开发机构建、数据库迁移陷阱、验证清单、回滚**。
> `script/README.md` 侧重目录结构、端口规划、设备接入参数、三份配置对应关系、历史踩坑 1-10。
> 两者配合使用，不重复内容。

---

## 1. 环境拓扑

```
开发机 M-PC (192.168.1.3)
    │  git push → 二开/main
    ▼
部署机 CY-PC (192.168.1.100, Windows)
    │  portproxy 端口转发
    ▼
  WSL2 (172.29.205.39, Ubuntu 24.04)
    │  Docker 29.7 + Compose v5.5
    ▼
  /home/docker/wvp2/   ← 部署根目录
    ├── docker-compose.yml
    ├── jar/            ← wvp.jar + Dockerfile + application*.yml
    ├── mysql/  redis/  zlm/  sql/  nginx/
    └── 4 容器：wvp-main / wvp-mysql / wvp-redis / zlmediakit
```

**访问入口**：`http://192.168.1.100:18080/`
**SSH**：`root@192.168.1.100`（落到 WSL2，非 Windows 宿主）

### 1.1 端口转发（关键前提）

`192.168.1.100` 是 Windows 宿主 IP，服务在 WSL2 的 `172.29.205.39`。Windows 必须做 portproxy 转发，否则页面打不开。

**WSL2 重启后 IP 会变**，规则随之失效。排查：

```powershell
# CY-PC 上以管理员身份
netsh interface portproxy show all
```

若 `connectaddress` 与 WSL2 当前 IP 不符，重建规则：

```powershell
netsh interface portproxy add v4tov4 listenport=18080 listenaddress=0.0.0.0 connectport=18080 connectaddress=<WSL2当前IP>
netsh interface portproxy add v4tov4 listenport=8160  listenaddress=0.0.0.0 connectport=8160  connectaddress=<WSL2当前IP>
netsh interface portproxy add v4tov4 listenport=18978 listenaddress=0.0.0.0 connectport=18978 connectaddress=<WSL2当前IP>
```

> 在 WSL2 内用 `ip -4 addr show eth0` 查当前 IP。

### 1.2 分层排查

| 层 | 验证方式 | 期望 |
|---|---|---|
| WSL2 内服务 | `curl 127.0.0.1:18080` | 200 |
| WSL2 网卡 | `curl 172.29.205.39:18080` | 200 |
| Windows 转发 | 在 CY-PC 上 `curl 192.168.1.100:18080` | 200 |
| 局域网其他机器 | 在 M-PC 上访问 | 200 |

前两层通、第三层不通 = portproxy 问题，不是服务问题。

---

## 2. 开发机构建

### 2.1 构建环境

| 项 | 值 |
|---|---|
| JDK | `D:/AppSpace/JDK/jdk-21.0.6`（**必须 21**，`jdk21.0.11` 目录无 javac） |
| Maven | `/d/AppSpace/maven/apache-maven-3.9.16/bin/mvn`（已在 PATH） |
| 本地仓库 | `D:/MavenReposity`（`-Dmaven.repo.local`） |
| Node | v22+，`web/node_modules` 已存在 |

### 2.2 前端（必须先做）

```bash
cd web
npm run build:prod
```

产物输出到 `src/main/resources/static/`（`.gitignore` 排除，不进仓库）。

> `pom.xml` **没有** `frontend-maven-plugin`，`mvn package` 不会构建前端。跳过这步会把 9-16 的旧前端打进 jar。
> 后果不只是"界面旧"：旧前端提交 `start`/`stop` 字段，新后端只认 `startTime`/`stopTime`，录制计划 `update()` 是先删后插，会**静默清空已有数据**。

### 2.3 后端

```bash
export JAVA_HOME="D:/AppSpace/JDK/jdk-21.0.6"
export PATH="$JAVA_HOME/bin:$PATH"

mvn -o -Dmaven.repo.local=D:/MavenReposity -DskipTests clean package
```

**产物**：`target/wvp-pro-3.0.0-<MMddHHmm>.jar`

> 版本号为 `3.0.0`，与上游 `源码/master` 一致。
> `pom.xml` 硬编码 `<skipTests>true</skipTests>`，`-DskipTests=false` 无效；但 **test-compile 仍会编译测试**。

### 2.4 产物自检

```bash
python -c "
import zipfile
z=zipfile.ZipFile('target/wvp-pro-3.0.0-XXXX.jar')
print('entries:', len(z.namelist()))
print('static:', sum(1 for n in z.namelist() if 'BOOT-INF/classes/static/' in n))
"
```

`static` 应为 100+。为 0 说明前端没打进包。

---

## 3. 部署流程

### 3.1 备份（每次必做）

```bash
ssh root@192.168.1.100
cd /home/docker/wvp2
TS=$(date +%Y%m%d%H%M)

cp -a jar/wvp.jar          jar/wvp.jar.bak-$TS
cp -a zlm/config.ini       zlm/config.ini.bak-$TS
cp -a docker-compose.yml   docker-compose.yml.bak-$TS

docker exec wvp-mysql mysqldump -uroot -p'Wvp@2026!mysql' \
  --single-transaction --routines --triggers wvp2 > mysql/backup-$TS.sql
```

备份文件命名约定：`<原名>.bak-<YYYYMMDDHHmm>`、`mysql/backup-<YYYYMMDDHHmm>.sql`。

### 3.2 上传 jar

```bash
# 开发机
scp target/wvp-pro-3.0.0-XXXX.jar root@192.168.1.100:/home/docker/wvp2/jar/wvp.jar.new
```

**文件名必须是 `wvp.jar`** —— `script/jar/Dockerfile` 里写死 `COPY wvp.jar /opt/wvp/wvp.jar`。

### 3.3 数据库迁移（仅 SQL 有变更时）

#### ⚠️ 更新脚本在存量库上不幂等（仅限 2.7.4）

> **`数据库/3.0.0/更新-*.sql` 是幂等的，可整份重复执行**，无需按段提取。
> 三段均为条件式：`20260606`/`20261019` 用 `information_schema` 判断后 `ALTER`，
> `20260909` 用 `create table IF NOT EXISTS`。
> 幂等的边界：对象已存在时**整表/整索引跳过**，不会补齐结构差异（如某库的
> `wvp_user_channel` 缺 `uk_user_channel`），此段不会修复。

`数据库/2.7.4/更新-mysql-2.7.4.sql` 的 `wvp_20260417` 段（存储过程，ALTER 在文件第 187 行）：

```sql
ALTER TABLE wvp_device_mobile_position ADD timestamp BIGINT COMMENT '上报时间';
```

**只有列级 `IF NOT EXISTS` 判断，没有表级保护**，而该表在更早版本已改名为 `wvp_mobile_position`——表已改名时子查询为空、`NOT EXISTS` 成立，ALTER 仍会执行并报 1146，整份脚本执行到这里中止：

```
ERROR 1146 (42S02): Table 'wvp2.wvp_device_mobile_position' doesn't exist
```

后续 `20260521` / `20260606` / `20260909` / `20261019` 全部被**跳过**。

**正确做法**：按需单独提取迁移段执行。

```bash
# 1. 定位段落
grep -n '20261019\|20260909\|20260606' /tmp/update.sql

# 2. 精确提取（注意：必须包含段落开头的 /*）
LINE=$(grep -n '\* 20261019 录像计划' /tmp/update.sql | cut -d: -f1)
START=$((LINE-1))
sed -n "${START},99999p" /tmp/update.sql | sed -n '1,/DROP PROCEDURE wvp_20261019;/p' > /tmp/one.sql

# 3. 执行
docker exec -i wvp-mysql mysql -uroot -p'Wvp@2026!mysql' wvp2 < /tmp/one.sql
```

> **提取陷阱**：若用 `sed -n '/20261019/,/DROP PROCEDURE/p'`，段落开头的 `/*` 会丢失（因为匹配行本身不含 `/*`），导致注释块不完整、整段变成语法错误。必须回退一行取 `/*`。

#### 各迁移段的适用场景

| 段 | 内容 | 何时需要 |
|---|---|---|
| `20260606` | `wvp_user.default_password` | 上游 2.7.4 初始化脚本删了该列；存量库通常已存在 |
| `20260909` | `wvp_user_channel` 表 | 二开功能，存量库通常已存在 |
| `20261019` | `wvp_record_plan_item` 的 `start/stop` → `start_time/stop_time` | **合并上游后必做**，代码已用新列名 |

执行前先查现状：

```sql
SELECT 'default_pw', COUNT(*) FROM information_schema.columns
  WHERE table_schema='wvp2' AND table_name='wvp_user' AND column_name='default_password'
UNION ALL SELECT 'user_channel', COUNT(*) FROM information_schema.tables
  WHERE table_schema='wvp2' AND table_name='wvp_user_channel'
UNION ALL SELECT 'start_time', COUNT(*) FROM information_schema.columns
  WHERE table_schema='wvp2' AND table_name='wvp_record_plan_item' AND column_name='start_time';
```

### 3.4 替换 jar 并重启容器

```bash
cd /home/docker/wvp2/jar
mv wvp.jar.new wvp.jar

cd /home/docker/wvp2
docker compose restart wvp
```

> 部署机的 compose 把 jar 以**挂载**方式注入（`- ./jar/wvp.jar:/opt/wvp/wvp.jar`），
> 覆盖了镜像内 `COPY` 的版本，因此**换 jar 只需 restart，无需 build**。
> 仅当 `jar/Dockerfile` 或依赖变化时才需要 `docker compose build wvp`。

### 3.5 启动

```bash
docker compose up -d
```

> **注意**：`up -d` 只会重建配置变化的容器。若 compose 有改动（如换 SQL 挂载），
> `up -d` 会重建 mysql/redis 等受影响的容器，但**不会**重启 wvp——必须单独 `restart wvp`。
> MySQL 重建时数据卷 `mysql/data` 保留；但若挂载路径写错，MySQL 会以空库启动并执行 init 脚本。

### 3.6 单独重启 zlmediakit（硬性规程）

```bash
docker compose restart zlmediakit
```

**为什么必须**：WVP 冷启动首连 ZLM 时调用 `setServerConfig` 热更新 hook 配置，该 reload 会令 ZLM(`master_py` 版) 的 keepalive 定时器失效 → WVP 每 20s 报 `[ZLM-心跳超时]`。单独 restart 让 ZLM 重读 config.ini 里已写死的 hook，keepalive 恢复。

**这条最容易忘，见 `script/README.md` 踩坑第 9 条。**

---

## 4. 验证清单

按顺序执行，全部通过才算部署成功。

### 4.1 容器状态

```bash
docker compose ps
```

四个容器全部 `Up`，mysql/redis 显示 `(healthy)`。

### 4.2 三大健康标志

```bash
docker compose logs wvp | grep -E 'SIP SERVER\] (tcp|udp)://.*启动成功|Started VManageBootstrap|ZLM-连接成功'
```

**三条都必须出现**。`ZLM-连接成功` 形如：

```
[ZLM-连接成功] ID：zlm-01, 地址： zlmediakit:18978
```

### 4.3 版本与构建时间

```bash
docker compose logs wvp | grep -E '构建版本|构建时间'
```

```
构建版本： 3.0.0
构建时间： 2026-10-28T12:33:13+08:00
```

构建时间应为本次构建时刻。若显示旧时间，说明 jar 没换成功。

### 4.4 页面

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/
```

应为 `200`。

### 4.5 ZLM hook 完整性

```bash
curl -s "http://127.0.0.1:18978/index/api/getServerConfig?secret=<MEDIA_SECRET>" \
| python3 -c "
import sys,json
c=json.load(sys.stdin)['data'][0]
print('hooks:', len([k for k in c if k.startswith('hook.on_')]))
print('on_publish:', c.get('hook.on_publish'))
"
```

期望 `hooks: 17`（或至少包含 `on_publish` / `on_stream_changed` / `on_server_started` / `on_stream_none_reader` 等关键项），且 `on_publish` 指向 `http://wvp:18080/index/hook/on_publish`。

### 4.6 登录

```bash
curl -s "http://127.0.0.1:18080/api/user/login?username=admin&password=21232f297a57a5a743894a0e4a801fc3"
```

`21232f29...` 是 `admin` 的 MD5。返回 `{"code":0,"msg":"成功",...}` 即正常。

### 4.7 稳定性（启动 1 分钟后）

```bash
docker compose logs --since 1m wvp | grep -c 'ZLM-心跳超时'   # 期望 0
docker compose logs --since 1m wvp | grep -c 'ERROR'          # 期望 0
```

> 启动后的最初 1-2 分钟内出现 1-2 次心跳超时属正常（restart zlm 的抖动期），日志会跟一句"主动探测成功，服务仍在线，重置心跳计时器"。持续出现才是问题。

---

## 5. 回滚

### 5.1 代码

```bash
cd /home/docker/wvp2/jar
cp -a wvp.jar.bak-<TS> wvp.jar
cd ..
docker compose restart wvp
docker compose restart zlmediakit
```

### 5.2 数据库

先反向改名（若本次执行过 `20261019`）：

```sql
ALTER TABLE wvp_record_plan_item CHANGE start_time `start` int;
ALTER TABLE wvp_record_plan_item CHANGE stop_time `stop` int;
```

再导入备份：

```bash
docker exec -i wvp-mysql mysql -uroot -p'Wvp@2026!mysql' wvp2 < mysql/backup-<TS>.sql
```

### 5.3 compose / zlm 配置

```bash
cp -a docker-compose.yml.bak-<TS> docker-compose.yml
cp -a zlm/config.ini.bak-<TS>     zlm/config.ini
docker compose up -d && docker compose restart zlmediakit
```

---

## 6. 只更新前端

**没有独立路径**。前端打进 jar，必须重打 jar（见 §2.2 + §2.3）。

手工解包替换 `BOOT-INF/classes/static/` 虽可行，但不推荐——容易与 jar 内其他资源版本错位。

---

## 7. 常见问题速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面打不开，但 WSL2 内 curl 200 | CY-PC 的 portproxy 失效（WSL2 IP 变了） | §1.1 重建转发规则 |
| `[ZLM-心跳超时]` 持续出现 | 启动后没单独 restart zlmediakit | `docker compose restart zlmediakit` |
| ZLM 启动异常 / 配置读不到 | `zlm/config.ini` 缺失 → Docker 把挂载源建成同名**目录** | 恢复 config.ini，删掉那个目录 |
| 录像计划查询报 `Unknown column 'start_time'` | jar 已更新但数据库没迁移 | 执行 `20261019` 段 |
| 新装库缺 `wvp_user_channel` / `default_password` | SQL 脚本未同步 | 用 `数据库/3.0.0/初始化-mysql-3.0.0` 建库；存量库执行 `数据库/3.0.0/更新-mysql-3.0.0.sql` |
| jar 内 `static` 为 0 | 跳过 `npm run build:prod` | 先构建前端再打包 |
| 登录报"认证失败" | 密码被改过 | 见 §8 |

---

## 8. 账号重置（应急）

密码存 `wvp_user.password`，为 32 位 MD5（`DigestUtils.md5DigestAsHex`）。

```bash
# 重置为 admin（MD5: 21232f297a57a5a743894a0e4a801fc3）
docker exec wvp-mysql mysql -uroot -p'Wvp@2026!mysql' wvp2 -e "
UPDATE wvp_user
SET password = '21232f297a57a5a743894a0e4a801fc3',
    default_password = 0,
    update_time = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')
WHERE username = 'admin';
"
```

`default_password = 1` 会在登录后强制改密。

> **重置前先备份**：`mysqldump wvp2 wvp_user wvp_user_role > mysql/user-backup-<TS>.sql`

---

## 9. 关键配置速查

### 9.1 compose 环境变量（`/home/docker/wvp2/docker-compose.yml`）

| 变量 | 说明 |
|---|---|
| `SPRING_PROFILES_ACTIVE` | 固定 `docker`，加载 `application-docker.yml` |
| `WVP_HOST` | 必须 `0.0.0.0`（填具体 IP 会 SIP 绑定失败） |
| `WVP_SHOW_IP` | 页面展示的接入 IP |
| `WVP_PORT` | SIP 端口，当前 `8160` |
| `WVP_ID` | 国标平台编码 |
| `MEDIA_SDP_IP` | 摄像头发 RTP 的目标 IP |
| `MEDIA_STREAM_IP` | 播放地址 IP |
| `MEDIA_SECRET` | **必须与 `zlm/config.ini` 的 `[api] secret` 完全一致** |
| `MEDIA_HOOK_IP` | ZLM 回调 WVP 用的容器名，当前 `wvp` |
| `MEDIA_RTP_ENABLE` | `false` = 单端口 10000 收流 |

### 9.2 端口

| 端口 | 用途 |
|---|---|
| `18080` | 页面 / API |
| `8160` | SIP（TCP + UDP） |
| `18978` | ZLM HTTP（FLV / HLS / API） |
| `10000` | RTP 收流（单端口模式） |
| `8970` | WebRTC |
| `13306` / `16379` | MySQL / Redis 调试（**公网部署必须注释**） |

---

## 10. 注意事项

1. **不要在服务器上改 `src/`** —— 部署包只认 `jar/wvp.jar`。
2. **`script/jar/application*.yml` 是独立副本** —— 与 `src/main/resources/application-docker.yml` 不是同一文件，改配置改服务器上这份。
3. **`zlm/config.ini` 挂载为 `:ro`** —— 容器内改不了，改宿主机文件后重启。
4. **前端改动必须重打 jar** —— 无热更新路径。
5. **每次重启 wvp 后单独 restart zlmediakit** —— 最容易被忘。
6. **`git push --all` / `--tags` 禁用** —— 会重建已删除的 `二开/V2` 并推送 worktree 分支。
7. **三处配置同步** —— 改端口/密钥时 `docker-compose.yml`、`zlm/config.ini`、`jar/application-docker.yml` 必须一起改（详见 `script/README.md` 第五节）。
