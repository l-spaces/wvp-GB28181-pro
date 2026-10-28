# 从源码远程合并上游更新（2.7.4 基线）

## Goal

`git fetch 源码` 后合并 `源码/master`（44 个上游提交）到新分支，保持 **2.7.4 数据库基线**，解决 5 处文本冲突与 4 类静默陷阱；编译与前端构建验证通过后合回 `main` 并推送到 `二开`。

## Requirements

### R1 远程与分支

- 更新源固定为远程 `源码`（`648540858/wvp-GB28181-pro`），合并目标固定为 `源码/master`（该远程无 `main`）。
- 合并在从 `main` 新建的 `update/upstream-274` 分支上进行，`main` 保持不动直到验证通过。
- 禁止 `git push --all` / `git push --tags`（会重建已删除的 `二开/V2`）。
- 不主动 push；推送前须经用户确认。

### R2 数据库基线：继续 2.7.4

- `pom.xml` 版本号保持 `2.7.4`（不跟随上游 3.0.0）。
- 不引入 `数据库/3.0.0/` 作为建库脚本；该目录若随合并进入仓库则原样保留，仅作参考。
- 必须把上游 3.0.0 中的**必要迁移**回补到 2.7.4 脚本：
  - `wvp_record_plan_item` 的 `start`/`stop` → `start_time`/`stop_time`（合并后 Java 代码已用新列名）。
  - `wvp_user.default_password` 列（上游已从 2.7.4 初始化脚本删除，但 Java 仍在读写）。
  - `wvp_user_channel` 表（上游任何 3.0.0 脚本都没有）。
- `数据库/2.7.4/初始化-*` 与 `数据库/2.7.4/更新-*` 需保持一致：新装库走初始化脚本，存量库走更新脚本。

### R3 冲突解决策略

| 文件 | 策略 |
|---|---|
| `AGENTS.md` (add/add) | 两者合并：Trellis 块置顶，上游正文放块外，避免 `trellis update` 覆盖 |
| `README.md` | 保留本地版本（本地已删除公众号/付费社群内容） |
| `InviteStreamServiceImpl.java` | 采上游 `InviteCallbackHolder` 架构，**整段删除**本地 `inviteKeyCreateTimeMap` / `cleanStaleInviteKeys` / `buildSubStreamKey` 残留 |
| `数据库/2.7.4/更新-mysql` / `更新-postgresql-kingbase` | 保留本地 `wvp_user_channel` 段；`wvp_20260606` 段与 3.0.0 重复但幂等，保留 |

### R4 静默陷阱（git 不报冲突但必须处理）

- `InviteStreamServiceImpl` 冲突区外的残留符号导致编译失败。
- `default_password` 列被上游静默删除。
- `start_time`/`stop_time` 只有代码改名、2.7.4 建库脚本未改。
- `wvp_user_channel` 在 3.0.0 脚本中缺失。

### R5 构建与验证

- `cd web && npm run build:prod` 重建前端（产物输出到被 gitignore 的 `src/main/resources/static`）。
- `mvn clean package` 通过（`pom.xml` 硬编码 `skipTests=true`，仅编译 + test-compile）。
- 必须验证 `target/classes` 中 `InviteStreamServiceImpl.class` 存在，证明编译真的跑过。

## Constraints

- 不扩大需求范围：不做与合并无关的重构。
- 不修改上游代码风格与既有业务逻辑，除非冲突解决必需。
- `application-dev.yml` 等 tracked-but-ignored 文件不得产生任何改动。
- 不提交 `$null`、`script/docker-compose.yml.bak.*`、`文档/`。

## Acceptance Criteria

- [ ] AC1 `git log --oneline main..update/upstream-274` 显示 `源码/master` 的 44 个提交已并入（merge commit + 上游提交）
- [ ] AC2 `git diff --name-only --diff-filter=U` 为空（无未解决冲突）
- [ ] AC3 `git grep -n 'inviteKeyCreateTimeMap\|cleanStaleInviteKeys\|buildSubStreamKey'` 无结果
- [ ] AC4 `数据库/2.7.4/初始化-mysql`、`初始化-postgresql-kingbase`、`初始化-达梦` 均含 `wvp_user_channel` 与 `default_password`
- [ ] AC5 `数据库/2.7.4/初始化-*` 与 `更新-*` 均使用 `start_time`/`stop_time`
- [ ] AC6 `script/sql/初始化-mysql-2.7.4.sql` 与 `数据库/2.7.4/初始化-mysql-2.7.4.sql` 同步（含 `secret varchar(255)`）
- [ ] AC7 `mvn clean package` 成功且 `target/classes/.../InviteStreamServiceImpl.class` 存在
- [ ] AC8 `web/dist` 或 `src/main/resources/static` 中有本次新构建的产物
- [ ] AC9 `git diff --cached` 不含 `application-dev.yml`、`$null`、`.bak.*`、`文档/`
- [ ] AC10 合回 `main` 后 `git status` 干净（除原有 3 项未跟踪）

## Out of Scope

- 不升级到 3.0.0。
- 不处理 `script/` 部署体系与上游的对齐（上游无 `script/`）。
- 不重建 `visual/` 与 `demo/`（独立工程，与本次合并不冲突）。
- 不清理残留 worktree、未跟踪文件（留待后续「c 项」）。

## Notes

- 上游 44 个提交中非合并 31 个，核心内容：云端录像独立会话、`DialogTerminationService`、点播回调清理重构、延迟队列修复、`@Async` 修复、3.0.0 版本升级。
- 本次合并会带入上游新增的 12 个测试文件，`test-compile` 会编译它们。
