# 执行计划：上游合并（2.7.4 基线）

> 回滚锚点：合并前 `main` = `7aa66b5c7`。任何阶段失败都先 `git merge --abort` 或 `git reset --hard 7aa66b5c7`。
> 全程禁止 `git push`（推送需用户单独确认）。

## 阶段 0：准备（无风险）

- [ ] 0.1 确认工作区状态：`git status -sb`，记录 3 项未跟踪文件现状
- [ ] 0.2 确认 `main` == `二开/main`：`git rev-parse main 二开/main`
- [ ] 0.3 拉取上游：`git fetch 源码`
- [ ] 0.4 **重跑预演**：`git merge-tree --write-tree 二开/main 源码/master`，与已知的 5 冲突比对；若上游有新提交，重新评估
- [ ] 0.5 新建分支：`git switch -c update/upstream-274 main`

**验证**：`git branch --show-current` = `update/upstream-274`

## 阶段 1：执行合并

- [ ] 1.1 `git merge 源码/master --no-ff`
- [ ] 1.2 `git status` 确认冲突清单，应为 5 个文件

**若冲突清单与预期不符**：停止，`git merge --abort`，回到阶段 0.4 重新评估。

## 阶段 2：解决冲突（按依赖顺序）

### 2.1 `README.md`（最简单，先清掉）

- [ ] `git checkout --ours README.md && git add README.md`

### 2.2 `AGENTS.md`（add/add）

- [ ] 打开文件，保留 `<!-- TRELLIS:START -->…<!-- TRELLIS:END -->` 块
- [ ] 将上游 50 行正文（`git show 源码/master:AGENTS.md`）追加到块外
- [ ] `git add AGENTS.md`

### 2.3 `InviteStreamServiceImpl.java`（最复杂）

- [ ] 两处冲突 hunk 均取 theirs
- [ ] 手工删除冲突区外的本地残留：
  - `inviteKeyCreateTimeMap` 字段声明
  - 两处 `inviteKeyCreateTimeMap.put/putIfAbsent`
  - 一处 `inviteKeyCreateTimeMap.remove`
  - 整个 `cleanStaleInviteKeys()` 方法（含 `@Scheduled(fixedRate = 5000)`）
  - `buildSubStreamKey()` 方法
- [ ] **验证**：`git grep -n 'inviteKeyCreateTimeMap\|cleanStaleInviteKeys\|buildSubStreamKey\|inviteErrorCallbackMap' -- src/` 零结果
- [ ] `git add` 该文件

### 2.4 数据库更新脚本（2 处）

- [ ] `git checkout --ours 数据库/2.7.4/更新-mysql-2.7.4.sql && git add ...`
- [ ] `git checkout --ours 数据库/2.7.4/更新-postgresql-kingbase-2.7.4.sql && git add ...`
- [ ] **验证**：两个文件均含 `wvp_user_channel` 与 `wvp_20260606`

### 2.5 自动合并文件复核（不改代码，只确认）

- [ ] `RecordPlanServiceImpl.java`：含 `channelDbIds` + `getStartTime/getStopTime`
- [ ] `RecordPlanMapper.java`：含 `channelDbIds` + `start_time/stop_time`
- [ ] `ServerController.java`：含 `SECRET_MASK` + `IUserChannelService`
- [ ] `web/src/utils/auth.js`：含 `RoleKey`，无 `console.log`
- [ ] `docker/wvp/wvp/application-docker.yml`：确认端口与 hook 未被改成不可用

**验证**：`git diff --diff-filter=U --name-only` 为空

## 阶段 3：数据库补齐（2.7.4 基线）

### 3.1 初始化脚本：`default_password` 补回

- [ ] `数据库/2.7.4/初始化-mysql-2.7.4.sql`：补 `default_password bool default false COMMENT '是否使用默认密码'` 列与 INSERT 列
- [ ] `数据库/2.7.4/初始化-postgresql-kingbase-2.7.4.sql`：同上（`bool default false` 写法按该文件风格）
- [ ] `数据库/2.7.4/初始化-达梦-2.7.4.sql`：上游已保留，确认无需改

**来源**：`git show 7aa66b5c7:数据库/2.7.4/初始化-mysql-2.7.4.sql`（L393、L426）

### 3.2 初始化脚本：`wvp_user_channel` 补回

- [ ] mysql：按本地 `7aa66b5c7` 版本 L542-550 补回
- [ ] postgresql-kingbase：按本地对应段补回
- [ ] 达梦：按本地 L1151-1161 补回

### 3.3 录像计划字段改名

- [ ] `数据库/2.7.4/初始化-mysql`：`start → start_time`、`stop → stop_time`
- [ ] `数据库/2.7.4/初始化-postgresql-kingbase`：同上
- [ ] `数据库/2.7.4/初始化-达梦`：同上，含 `COMMENT ON COLUMN` 同步
- [ ] `数据库/2.7.4/更新-mysql`：追加 `20261019` 段（照抄上游 3.0.0 写法）
- [ ] `数据库/2.7.4/更新-postgresql-kingbase`：追加 `20261019` 段（照抄上游 3.0.0）
- [ ] `数据库/2.7.4/初始化-达梦` 无更新脚本，仅改初始化

### 3.4 部署副本同步

- [ ] `script/sql/初始化-mysql-2.7.4.sql`：同步 3.1 / 3.2 / 3.3，**保留 `secret varchar(255)`**
- [ ] 校验：`diff <(git show main:'数据库/2.7.4/初始化-mysql-2.7.4.sql') <(cat script/sql/初始化-mysql-2.7.4.sql)` 仅剩 `secret` 宽度差异
- [ ] `docker/mysql/db/wvp.sql`：确认上游已改为 `start_time/stop_time`；若缺 `wvp_user_channel` / `default_password` 则补

## 阶段 4：构建验证

- [ ] 4.1 `cd web && npm run build:prod`
  - 若 `node_modules` 缺失先 `npm install`
  - 确认 `src/main/resources/static` 产物时间戳为本次构建
- [ ] 4.2 `mvn clean package`（本地参数：`-Dmaven.repo.local=D:\MavenReposity`）
  - 关注 `test-compile` 阶段是否因上游新增测试失败
- [ ] 4.3 验证编译确实执行：`ls -la target/classes/com/genersoft/iot/vmp/gb28181/service/impl/InviteStreamServiceImpl.class`
- [ ] 4.4 验证产物：`ls -la target/wvp-pro-2.7.4-*.jar`

**若编译失败**：回到阶段 2.3，检查是否有未清理的旧符号引用。

## 阶段 5：提交与合回

- [ ] 5.1 `git status` 检查，确认不含 `application-dev.yml`、`$null`、`.bak.*`、`文档/`
- [ ] 5.2 `git add` 逐文件添加（**禁止 `git add -A` / `git add .`**）
- [ ] 5.3 `git commit`：合并提交（含数据库补齐）
- [ ] 5.4 在 `update/upstream-274` 上做最终自检（对应 AC1–AC9）
- [ ] 5.5 `git switch main && git merge --no-ff update/upstream-274`
- [ ] 5.6 **暂停**，向用户报告验证结果，等确认后再 `git push`

## 验证命令清单

```bash
# AC1 上游提交已并入
git log --oneline main..update/upstream-274 | head -50

# AC2 无未解决冲突
git diff --name-only --diff-filter=U

# AC3 本地旧符号已清除
git grep -n 'inviteKeyCreateTimeMap|cleanStaleInviteKeys|buildSubStreamKey' -- src/

# AC4/AC5 SQL 缺口
git grep -c 'wvp_user_channel' -- '数据库/2.7.4/初始化-*.sql'
git grep -c 'default_password' -- '数据库/2.7.4/初始化-*.sql'
git grep -n 'start_time|stop_time' -- '数据库/2.7.4/初始化-*.sql'

# AC6 部署副本同步
git diff --no-index --stat script/sql/初始化-mysql-2.7.4.sql 数据库/2.7.4/初始化-mysql-2.7.4.sql

# AC7 编译产物
ls -la target/classes/com/genersoft/iot/vmp/gb28181/service/impl/InviteStreamServiceImpl.class

# AC9 暂存区干净
git diff --cached --name-only | grep -E 'application-dev\.yml|^\$null|\.bak\.|^文档/'
```

## 检查点（每阶段结束向用户汇报）

| 检查点 | 内容 |
|---|---|
| CP1 | 合并完成，冲突清单 = 预期 5 个 |
| CP2 | 5 处冲突全部解决，`--diff-filter=U` 为空 |
| CP3 | 数据库补齐完成，缺口矩阵全部转绿 |
| CP4 | 前端 + Maven 构建成功 |
| CP5 | 合回 `main` 完成，等待推送确认 |
