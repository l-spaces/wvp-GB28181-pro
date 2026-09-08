# WVP + ZLMediaKit Docker 部署说明

本目录是自包含的部署包：本地打包 jar（带前端）后，整个目录上传到服务器即可部署。

## 一、目录结构

```
script/
├── docker-compose.yml        部署编排（4 个服务：mysql / redis / zlmediakit / wvp）
├── jar/
│   ├── wvp.jar               后端 jar（本地打包，自带 Web 前端）
│   ├── application.yml       激活 docker profile
│   ├── application-docker.yml  WVP 核心配置（环境变量占位符版）
│   └── Dockerfile            镜像定义（业务文件为挂载，一般无需重建）
├── sql/初始化-mysql-2.7.4.sql  首次启动自动建表（secret 列已扩为 varchar(255)）
├── zlm/config.ini            ZLMediaKit 配置（官方模板 + 最小定制）
├── redis/conf/redis.conf     Redis 配置（requirepass cy*889900）
└── nginx/                    与 WVP 无关的历史遗留文件，可删除
```

## 二、快速部署（全新服务器）

```bash
# 1. 上传整个 script 目录到服务器，例如 /home/docker/wvp2
# 2. 准备宿主机目录（compose 挂载的绝对路径）
mkdir -p /home/docker/wvp2/data /home/docker/wvp2/mysql/conf \
         /home/docker/wvp2/redis/conf /home/docker/wvp2/redis/data \
         /home/docker/wvp2/zlm/logs /home/docker/wvp2/zlm/record \
         /home/docker/wvp2/jar/logs
#    （config.ini 和 redis.conf 已随目录上传，无需再复制）
# 3. 构建并启动
cd /home/docker/wvp2 && docker compose up -d --build
# 4. 查看状态
docker compose ps
docker logs -f wvp-main     # 看到三条即健康：SIP SERVER 启动成功 / Started VManageBootstrap / ZLM-连接成功
```

> 注意：`--build` 需要拉取基础镜像 bellsoft/liberica-openjdk-rocky:21.0.12-cds，
> 国内服务器可能超时。已部署过的环境更新时不需要 --build（见"日常更新"）。

## 三、端口规划

| 宿主机端口 | 容器端口 | 协议 | 用途 |
|---|---|---|---|
| 18080 | 18080 | TCP | WVP 管理页面 + API（默认账号 admin/admin，**部署后立即改密码**） |
| 8160 | 8160 | TCP+UDP | SIP 信令（设备注册入口） |
| 18978 | 18978 | TCP | ZLM 流播放（HTTP-FLV / HLS / WS-FLV） |
| 10000 | 10000 | UDP(+TCP) | RTP 收流（设备推流，单端口模式） |
| 8970 | 8970 | UDP+TCP | ZLM WebRTC 媒体端口（STUN/DTLS/SRTP；信令仍走 18978） |
| 13306 | 3306 | TCP | MySQL 调试（公网部署必须关闭/注释） |
| 16379 | 6379 | TCP | Redis 调试（公网部署必须关闭/注释） |

注释掉的可选端口（compose 中按需打开并放行防火墙）：8443（HTTPS流）、554（RTSP）、
1935（RTMP）、19000/udp（SRT）、30000-30100（多端口 RTP 模式）。

## 四、设备接入参数（当前配置值）

| 配置项 | 值 |
|---|---|
| SIP 服务器 | `<本机可达IP>:8160`（UDP） |
| SIP 域 | 5132210000 |
| 服务器国标编码 | 51322100002000000001 |
| 注册密码 | cy*889900 |
| RTP 推流地址 | `<本机可达IP>:10000`（单端口，SSRC 区分流） |

摄像头建议用 UDP 传输（TCP 在 NAT 环境下 WVP 无法主动连接设备，点播会报
"Could not create a message channel"）。

## 五、三份配置文件的对应关系（改端口必须三处同步）

| 配置项 | docker-compose.yml | zlm/config.ini | jar/application-docker.yml |
|---|---|---|---|
| ZLM HTTP 端口 | `ZLM_PORT` + 映射 | `[http] port` | `http-port`（占位符默认值） |
| RTP 收流端口 | `MEDIA_RTP_PORT_RANGE` + 映射 | `[rtp_proxy] port`、`port_range` | `rtp.port-range` |
| ZLM 鉴权密钥 | `MEDIA_SECRET` | `[api] secret` | `secret`（占位符默认值） |
| ZLM 节点 ID | `MEDIA_ID` | `[general] mediaServerId` | `media.id` |
| WVP SIP 端口 | `WVP_PORT` + 映射 | — | `sip.port` |
| WebRTC 媒体端口 | 映射（8970） | `[rtc] port`、`tcpPort` | — |

关键环境变量：`MEDIA_SDP_IP`（设备推流目标 IP）、`MEDIA_STREAM_IP`（播放地址 IP）、
`WVP_SHOW_IP`（页面展示 IP）——三者通常相同，都填**客户端可达的服务器 IP**。
`WVP_HOST` 必须保持 `0.0.0.0`（容器内监听绑定，填具体 IP 会绑定失败导致启动循环）。

## 六、日常更新（无需重建镜像）

wvp.jar / application.yml / application-docker.yml 均为宿主机挂载，改完传上去重启即可：

```bash
# 本地改动后同步（示例）
scp jar/application-docker.yml root@<服务器>:/home/docker/wvp2/jar/
scp jar/wvp.jar               root@<服务器>:/home/docker/wvp2/jar/

# 服务器上应用（改 compose 用 up -d，改 yml/jar 用 restart wvp）
cd /home/docker/wvp2
docker compose up -d            # compose 本身变化（端口/环境变量/挂载）
docker compose restart wvp      # 只改了 yml 或 jar
docker compose restart zlmediakit  # 只改了 zlm/config.ini
```

> 原则上用 `up -d` 而不是 `restart`：up -d 遵守 depends_on 健康检查顺序；
> 全量 restart 是并行的，WVP 可能比 MySQL 先起而报一次启动失败（会自动恢复，无害）。

## 七、公网部署

1. 放行端口：**8160/tcp+udp、10000/udp、18978/tcp**（必须）、**8970/udp+tcp**（WebRTC 播放需要）；18080/tcp 视需要
   （管理界面，建议安全组限制来源 IP）；**注释掉 13306 和 16379 映射**。
2. 改 IP 参数：`MEDIA_SDP_IP`、`MEDIA_STREAM_IP`、`WVP_SHOW_IP` 全部改为公网 IP。
3. 云服务器安全组和系统防火墙（firewalld/ufw）两层都要放行。

## 八、踩坑记录（历史问题，引以为戒）

1. **MySQL 密码**：compose 里 `MYSQL_PASSWORD` 与 `SPRING_DATASOURCE_PASSWORD` 必须一致。
2. **Redis 数据目录权限**：官方镜像以 UID 999 运行，数据目录需 `chown -R 999:999`
   （或确保目录 777），否则报 `Can't open append-only dir: Permission denied`。
3. **secret 长度**：`wvp_media_server.secret` 列已扩为 varchar(255)，超过 50 位的
   密钥会导致 WVP 启动时 `Data too long for column 'secret'`（SQL 文件已同步修复）。
4. **WVP_HOST**：只能是 0.0.0.0 或容器内真实 IP。填宿主机/公网 IP 会 SIP 绑定失败。
5. **NAT 后的设备**：摄像头必须用 UDP 注册；TCP 模式 WVP 需主动连接设备地址，
   NAT 下不可达。
6. **网关/防火墙端口映射**：设备推流端口（10000）必须对设备侧可达，否则点播时
   SIP 信令成功但收不到流。
7. **改 ZLM HTTP 端口**：除三处配置外，如 WVP 已运行过，数据库 `wvp_media_server`
   表的 `http_port` 也要同步更新（WVP 以数据库记录的端口连接 ZLM）。
8. **WebRTC 播放**：媒体端口 8970（UDP+TCP，ZLM 要求 NAT/映射环境下内外端口必须一致）；
   还需 `[rtc] externIP` 设为客户端可达的公网 IP——留空时 ZLM 在 ICE answer 里下发容器
   内网 IP，浏览器无法连接（此版 ZLM 的 externIP 支持填 `$EXTERN_IP` 形式的环境变量）。
   另外浏览器 Chrome ≤135 不支持 WebRTC 接收 H265，摄像头需推 H264。
9. **WVP 重启后 ZLM keepalive 失效**：WVP 冷启动首连 ZLM 时调用 setServerConfig 热更新
   hook 配置，该 reload 会令 ZLM(master_py 版) 的 keepalive 定时器失效——WVP 每 20s 报
   `[ZLM-心跳超时]`（主动探测兜底，不影响点播功能）。**规程：每次重启 wvp 后，必须再
   单独执行一次 `docker compose restart zlmediakit`**（ZLM 单独重启时读 config.ini 已
   写死的 hook，keepalive 恢复正常）。
