# 开启use-source-ip-as-stream-ip修复内网播放

## Goal

在112.44.242.59服务器的wvp compose中注入SPRING_APPLICATION_JSON开启use-source-ip-as-stream-ip，使播放地址按请求host生成，修复内网192.168.3.210:18080访问时ws仍指向公网IP导致播放失败的问题

## Requirements

- 不改代码、不重打包 jar，仅通过 compose 环境变量注入配置：
  `SPRING_APPLICATION_JSON: '{"user-settings":{"use-source-ip-as-stream-ip":true}}'`（wvp 服务）
- 改前备份 `/home/cy/wvp2/docker-compose.yml`（沿用 `.bak.<时间戳>` 惯例）
- 环境变量变更必须 `docker compose up -d wvp` 重建容器（restart 不生效），随后按既有规程单独 `docker compose restart zlmediakit`
- 不改动数据库 `wvp_media_server`（sdp_ip/stream_ip 保持 112.44.242.59），不影响摄像头 INVITE/收流链路与外网播放
- 回滚方式：恢复备份 compose 后 `docker compose up -d wvp` + `restart zlmediakit`

## Acceptance Criteria

- [x] wvp 容器重建成功，日志健康标志齐全（Started VManageBootstrap / ZLM-连接成功，无心跳超时异常）
- [x] 内网经 192.168.3.210:18080 点播，播放地址 host 变为 192.168.3.210（ws://192.168.3.210:18978/...），播放成功（用户内网浏览器 F12 复验）
- [x] 外网经 112.44.242.59 访问，播放地址仍为公网 IP，播放不受影响（用户复验通过）
- [x] zlmediakit 单独重启后 hook 配置完好（getServerConfig 检查 hook.on_publish 仍在）

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
