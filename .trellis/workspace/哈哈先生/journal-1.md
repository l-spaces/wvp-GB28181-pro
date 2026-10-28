# Journal - 哈哈先生 (Part 1)

> AI development session journal
> Started: 2026-09-07

---



## Session 1: 用户-通道分配与查询过滤：实现·检查·部署·归档
<!-- trellis-session: v=2 fp=6e087851d7e31be9 -->

**Date**: 2026-09-11
**Task**: 用户-通道分配与查询过滤：实现·检查·部署·归档
**Package**: be.teletask.onvif-java
**Branch**: `feature/user-channel-assign`

### Summary

实现用户关联通道分配(wvp_user_channel + Mapper/Service/Controller)与显示级过滤(设备/通道分页、控制台统计、通道列表含行政区划/组织机构页签、报警、录制计划；roleId==1不过滤)；trellis-check 修复4处问题(ServerController超范围回归、组织机构页签过滤缺口、RegionServiceImpl O(n²)、UserChannelMapper left→inner join)；部署测试环境经浏览器MCP端到端验证通过；沉淀 channel-permission-filtering.md spec。代码在 feature/user-channel-assign 分支(3cb3110e0 + cf0c83740)。

### Git Commits

| Hash | Message |
|------|---------|
| `3cb3110e0` | feat(user-channel): 用户关联设备（通道）分配与查询过滤 |
| `cf0c83740` | docs(spec): 沉淀通道显示级权限过滤契约(channel-permission-filtering) |

### Status

[OK] **Completed**


## Session 2: 菜单显示权限控制（非管理员白名单）：实现·验证·提交
<!-- trellis-session: v=2 fp=03a0363b1da1dc96 -->

**Date**: 2026-09-11
**Task**: 菜单显示权限控制（非管理员白名单）：实现·验证·提交
**Package**: be.teletask.onvif-java
**Branch**: `feature/menu-visibility`

### Summary

web 菜单按角色过滤：登录落地 roleId 到 wvp_role cookie（auth.js 三件套 + user store + getter），Sidebar routes() 按 roleId===1 全量/白名单5项(控制台/分屏监控/通道列表/电子地图/云端录像)过滤；roleId 缺失保守按非管理员；仅隐藏菜单不加路由守卫。npm build 通过，部署测试环境浏览器端到端验证 7 项全过（admin 13 项回归、test1 5 项、刷新持久化、logout 清理），trellis-check 零缺陷。提交在 feature/menu-visibility 分支(基于 feature/user-channel-assign)。

### Git Commits

| Hash | Message |
|------|---------|
| `e613879c3` | feat(web): 非管理员菜单白名单显示 |

### Status

[OK] **Completed**


## Session 3: 内网播放失败（播放地址为公网IP）：诊断·修复·沉淀
<!-- trellis-session: v=2 fp=3f1724c85bf66867 -->

**Date**: 2026-09-16
**Task**: 内网播放失败（播放地址为公网IP）：诊断·修复·沉淀
**Package**: be.teletask.onvif-java
**Branch**: `main`

### Summary

内网经 192.168.3.210:18080 打开页面正常但点播失败。根因：WVP 播放地址 host 取 wvp_media_server.stream_ip（112.44.242.59），use-source-ip-as-stream-ip 默认 false，内网浏览器被迫连公网 IP，防火墙无 NAT 回环故连不上。修复：wvp 服务注入 SPRING_APPLICATION_JSON 开启该开关，up -d wvp 重建 + 单独 restart zlmediakit，内外网复验通过。

### Main Changes

- 服务器 /home/cy/wvp2 的 docker-compose.yml 注入 SPRING_APPLICATION_JSON 开启 use-source-ip-as-stream-ip（备份 bak.20260916034020）
- script/README.md 新增踩坑第 10 条：根因、解法、以及“服务器自测公网 IP 可达不代表内网其他主机可达”的排查陷阱
- 运维执行计划沉淀到任务 research/ops-plan.md（含验证与回滚步骤）

### Git Commits

| Hash | Message |
|------|---------|
| `b95bc148e` | docs(script): 沉淀内网播放地址为公网IP导致播放失败的排查与解法 |

### Testing

- [OK] 服务器端：SIP SERVER 启动成功 / Started VManageBootstrap / ZLM-连接成功，getServerConfig 确认 hook.on_publish 等 10 个 hook 完好
- [OK] 用户复验：内网经 192.168.3.210:18080 播放正常（ws 指向内网 IP），外网经 112.44.242.59 播放不受影响

### Status

[OK] **Completed**

### Next Steps

- WebRTC 播放若内网使用，仍需处理 [rtc] externIP 回环问题（本次未涉及，播放器默认走 ws-flv）


## Session 4: 从源码合并上游 44 提交（2.7.4 基线）
<!-- trellis-session: v=2 fp=d941600042099497 -->

**Date**: 2026-10-28
**Task**: 从源码合并上游 44 提交（2.7.4 基线）
**Package**: be.teletask.onvif-java
**Branch**: `update/upstream-274`

### Summary

从源码远程合并上游 44 个提交到 update/upstream-274，保持 2.7.4 数据库基线。解决 5 处文本冲突（AGENTS.md/README.md/InviteStreamServiceImpl/两份更新 SQL），并处理 4 类静默陷阱：清理 InviteStreamServiceImpl 冲突区外的本地僵尸清理残留、补回 wvp_user.default_password、将 wvp_record_plan_item 字段改为 start_time/stop_time（三份 init + 两份 update 新增 20261019 段）、补入 wvp_user_channel 到 docker SQL、同步 script/sql 部署副本、pom 版本改回 2.7.4。编译与前端构建均通过，已合回 main。

### Main Changes

- 合并 源码/master 44 提交，冲突基点为 fb45787da
- InviteStreamServiceImpl 采上游 InviteCallbackHolder 架构，删除本地 inviteKeyCreateTimeMap/cleanStaleInviteKeys
- 数据库 2.7.4 三方言补齐 default_password、wvp_user_channel、start_time/stop_time
- pom.xml 版本保持 2.7.4，产物 wvp-pro-2.7.4-10280433.jar

### Git Commits

| Hash | Message |
|------|---------|
| `2f73954b0` | Merge 源码/master into update/upstream-274（保持 2.7.4 数据库基线） |
| `df6f15dad` | Merge branch 'update/upstream-274' |

### Testing

- [OK] mvn -o clean package 成功（783 主源码 + 20 测试源码）
- [OK] web npm run build:prod 成功，jar 内含 134 个 static 条目

### Status

[OK] **Completed**

### Next Steps

- 确认后 git push 到 二开/main
- 后续处理部署包 script/zlm/config.ini 缺失与未跟踪文件清理


## Session 5: 补齐 2.7.4 SQL 副本缺口（H2 与 docker）
<!-- trellis-session: v=2 fp=b27074e22dcca0c3 -->

**Date**: 2026-10-28
**Task**: 补齐 2.7.4 SQL 副本缺口（H2 与 docker）
**Package**: be.teletask.onvif-java
**Branch**: `main`

### Summary

合并收尾：H2 schema 严重过时（缺 5 表、wvp_device_mobile_position 是重命名前旧结构、start/stop 旧列名），补齐后表清单与 mysql 2.7.4 完全一致；docker/mysql/db/wvp.sql 补齐 3 表并修正旧表名。H2 schema+data 用 H2 2.3.232 引擎实际执行验证通过。

### Main Changes

- H2: 补 wvp_alarm/wvp_jt_channel/wvp_jt_terminal/wvp_mobile_position/wvp_user_channel
- H2: wvp_device_mobile_position（旧结构）→ wvp_mobile_position（代码实际使用）
- docker/wvp.sql: 补 wvp_alarm/wvp_jt_channel/wvp_jt_terminal，修正旧表名

### Git Commits

| Hash | Message |
|------|---------|
| `0fa1dfe23` | fix(db): 补齐 H2 与 docker SQL 副本的 2.7.4 缺口 |

### Testing

- [OK] H2 2.3.232 引擎执行 schema+data 成功（exit 0）
- [OK] 六份 2.7.4 SQL 表清单逐一比对一致
- [OK] mvn compile 通过

### Status

[OK] **Completed**

### Next Steps

- git push 到 二开/main
- 处理 script/zlm/config.ini 缺失（compose 仍挂载）


## Session 6: 清理工作区（c 项）：删除误生成文件与残留 worktree
<!-- trellis-session: v=2 fp=2302678765c610cd -->

**Date**: 2026-10-28
**Task**: 清理工作区（c 项）：删除误生成文件与残留 worktree
**Package**: be.teletask.onvif-java
**Branch**: `main`

### Summary

清理合并后残留：删除 （rg 报错文本）与 script/docker-compose.yml.bak.20260908101745（含明文口令）；文档/ 含明文服务器地址与账号口令，加入 .gitignore 后保留在本地；删除停在分叉基点 fb45787da 的残留 worktree 及其分支（无独有提交，demo/ 已在 main）。

### Main Changes

- 删除 $null 与 script/docker-compose.yml.bak.20260908101745
- .gitignore 新增 /文档/ 忽略规则
- 删除 worktree-agent-aa75352d232bd53f8 工作区与分支

### Git Commits

| Hash | Message |
|------|---------|
| `544919b2c` | chore(git): 忽略本地文档目录 |

### Testing

- [OK] git status 完全干净（无未跟踪文件）
- [OK] git worktree list 仅剩主工作区

### Status

[OK] **Completed**

### Next Steps

- 分支清理待用户决定（V2/feature/*/master/update-upstream 均已并入 main）
- 处理 script/zlm/config.ini 缺失


## Session 7: 恢复 ZLM 配置并部署到本地环境
<!-- trellis-session: v=2 fp=6fb3d77abb09b35f -->

**Date**: 2026-10-28
**Task**: 恢复 ZLM 配置并部署到本地环境
**Package**: be.teletask.onvif-java
**Branch**: `main`

### Summary

恢复 7aa66b5c7 中被误删的 script/zlm/config.ini（逐字节恢复），修复 compose 挂载缺失导致的部署包不完整；随后全量部署到 CY-PC WSL2（/home/docker/wvp2）：备份 → 执行 20261019 数据库迁移 → 上传新 jar → 重建镜像 → 启动四容器 → 按规程单独 restart zlmediakit。部署后三大健康标志通过，页面 HTTP 200，二开功能（用户通道列表/非管理员 403）实测正常。

### Main Changes

- 恢复 script/zlm/config.ini（714 行，43430 字节）
- 服务器执行 20261019 迁移：wvp_record_plan_item start/stop → start_time/stop_time
- 部署新 jar 并重建 wvp2-wvp 镜像
- 重置 admin/test1 密码为 admin（default_password=0）

### Git Commits

| Hash | Message |
|------|---------|
| `907b67dde` | fix(script): 恢复被误删的 ZLM 配置 |

### Testing

- [OK] 页面 HTTP 200，标题 WVP视频平台
- [OK] SIP SERVER 启动成功 / Started VManageBootstrap / ZLM-连接成功
- [OK] 17 个 ZLM hook 完好，on_publish 指向 wvp:18080
- [OK] admin 用户通道列表返回数据，test1 返回 403
- [OK] 13:37:30 后无心跳超时、无 ERROR

### Status

[OK] **Completed**

### Next Steps

- 确认 zlm rtp.port_range 与 compose 映射是否统一（30000-30100 vs 30000-30060）
- 上游更新脚本在存量库不幂等（wvp_20260417 段缺 IF EXISTS），建议补进 spec
