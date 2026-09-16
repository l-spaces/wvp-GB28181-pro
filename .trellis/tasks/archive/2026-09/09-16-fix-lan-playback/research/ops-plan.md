# 运维执行计划：开启 use-source-ip-as-stream-ip

## 诊断结论（2026-09-16 已查实）

- 现象：内网经 192.168.3.210:18080 打开页面正常，点播失败；外网经 112.44.242.59 播放正常。
- 根因：播放地址 host 由 `wvp_media_server.stream_ip`（=112.44.242.59）生成，
  `user-settings.use-source-ip-as-stream-ip` 默认 false（`UserSetting.java:79`），
  `PlayController.java:117` 不按请求 host 替换 → 内网浏览器被迫连公网 IP，
  防火墙无 NAT 回环（TCP 18978 映射存在，但无 SNAT 回流）→ ws 连接失败。
- 佐证：`ws_flv_port=0`，ws_flv 用 `http_port=18978`（`ZLMMediaNodeServerService.java:668`）；
  数据库 `sdp_ip/stream_ip` 均为 112.44.242.59（compose 三变量同）。
- 服务器：`cy@112.44.242.59:2222`（SSH MCP default），部署路径 `/home/cy/wvp2`，
  容器 wvp-main / zlmediakit，服务名 wvp / zlmediakit。

## 执行步骤（服务器上）

1. 备份：`cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d%H%M%S)`
2. 在 `wvp` 服务的 environment 段（`SPRING_PROFILES_ACTIVE: "docker"` 附近，约 109 行）追加：
   `SPRING_APPLICATION_JSON: '{"user-settings":{"use-source-ip-as-stream-ip":true}}'`
   - 用 sed 在 SPRING_PROFILES_ACTIVE 行后插入；注意保持 6 空格缩进
3. `docker compose up -d wvp`（env 变更需重建，restart 不生效）
4. `docker compose restart zlmediakit`（既有规程：wvp 重启后必须单独重启 ZLM，
   否则 hook/keepalive 异常）
5. 健康检查：`docker logs wvp-main --since 2m` 出现
   SIP SERVER 启动成功 / Started VManageBootstrap / ZLM-连接成功；
   `getServerConfig` 确认 hook.on_publish 仍在

## 验证

- 内网浏览器 F12：ws 应为 `ws://192.168.3.210:18978/rtp/...`（用户复验）
- 外网浏览器：仍为 `ws://112.44.242.59:18978/...`，播放正常

## 回滚

`cp docker-compose.yml.bak.<时间戳> docker-compose.yml && docker compose up -d wvp && docker compose restart zlmediakit`

## 风险与边界

- 不动数据库、不动 config.ini、不动 sdp_ip → 摄像头 INVITE/收流链路不变
- 端口不替换（仍 18978），内外端口一致，无影响
- WebRTC 播放仍有 externIP 回环问题（本任务不处理，播放器默认 ws-flv）
