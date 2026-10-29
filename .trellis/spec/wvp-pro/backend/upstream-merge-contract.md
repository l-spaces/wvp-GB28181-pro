# 上游合并契约（源码 → 二开）

> 适用场景：把远程 `源码`（`648540858/wvp-GB28181-pro`）的更新合并进本仓库。
> 本文件记录的是**必须执行的契约**，不是建议。

---

## 1. 远程与分支

| 远程 | 角色 | 约束 |
|---|---|---|
| `源码` | 上游，只读 | 默认分支是 `master`，**没有 `main`** |
| `二开` | 本仓库 fork，可写 | 唯一提交目标，远端 HEAD 是 `main` |

**仓库没有 `origin` 远程。** 因此：

```bash
# 正确：显式指定上游
git fetch 源码 && git merge 源码/master

# 错误：不带参数只会走 二开，拿不到上游更新
git pull
```

**禁止** `git push --all` / `git push --tags`：会重建已删除的 `二开/V2`，并把本地独有分支一起推上去（当前为 `update/upstream-274`）。

## 2. 合并前必须做的预演

```bash
git fetch 源码
git merge-tree --write-tree main 源码/master   # rc=1 表示有冲突，输出中含 CONFLICT 行
```

预演只产生**文本冲突**清单。**不报冲突不等于安全**——见 §4。

## 3. 冲突解决契约

| 文件 | 策略 | 理由 |
|---|---|---|
| `AGENTS.md` | Trellis 块置顶 + 上游正文置于块外 | `trellis update` 只覆盖标记块内内容 |
| `README.md` | 保留本地 | 本地已删除公众号/付费社群内容 |
| `InviteStreamServiceImpl.java` | 采上游 `InviteCallbackHolder` 架构 | 本地僵尸清理是上游实现的子集 |
| `数据库/2.7.4/更新-*` | 保留本地 | 上游把 `20260606` 挪进 3.0.0，选 theirs 会丢失存量库迁移 |

### 3.1 `InviteStreamServiceImpl` 的额外清理

仅按冲突标记解完**编译不过**。必须手工删除冲突区外的残留：

- 字段 `inviteKeyCreateTimeMap`
- 全部 `inviteKeyCreateTimeMap.put` / `putIfAbsent` / `remove`
- 整个 `cleanStaleInviteKeys()` 方法及其 `@Scheduled(fixedRate = 5000)`
- `buildSubStreamKey()` 方法
- 对 `inviteErrorCallbackMap` 的引用（上游已改名 `inviteCallbackMap`）

判定命令：

```bash
git grep -n 'inviteKeyCreateTimeMap\|cleanStaleInviteKeys\|buildSubStreamKey' -- src/
# 必须为零结果
```

上游用 `InviteCallbackHolder.createTime` + `cleanExpiredInviteCallbacks()`
（在 `@Scheduled(fixedRate = 10000)` 的 `execute()` 中调用）实现同一功能，
且 `DynamicTask.stop` 修掉了根因。**不要恢复本地那套。**

## 4. 静默陷阱（git 不报冲突但必须处理）

| 陷阱 | 症状 | 处理 |
|---|---|---|
| `default_password` 列被上游从 2.7.4 的 mysql / postgresql-kingbase 初始化脚本删除（达梦仍保留） | 新装库改密报 `Unknown column` | 补回列定义与 INSERT 列 |
| `start`/`stop` → `start_time`/`stop_time` 只在 3.0.0 脚本改名 | 用 2.7.4 建库后录像计划查询报错 | 三份 2.7.4 初始化脚本新增 `start_time`/`stop_time`（保留上游 `start`/`stop` 兼容列）+ 两份更新脚本加 `20261019` 段 |
| `wvp_user_channel` 在任何 3.0.0 脚本中都不存在 | 通道权限过滤全线报 `table doesn't exist` | 补入目标版本的全部初始化/更新脚本 |
| 上游改动 `pom.xml` 的 `<version>` 且与本地基线不一致 | jar 名与数据库脚本版本不匹配 | 以本地基线为准改回，见 §5 |
| `script/sql/` 是部署实际挂载的副本，上游没有该目录 | 部署建库缺列/缺表 | 每次合并后手工同步 |
| 前端未重建 | 旧资源被打进 jar；旧前端提交旧字段导致数据被静默清空 | 先 `cd web && npm run build:prod` 再 `mvn package` |

### 4.1 字段改名必须三层同改

```
数据库列  →  MyBatis Mapper  →  Java Bean / 前端 payload
```

只改两层就会出现「编译通过但运行时报 Unknown column」或「接口返回空」。

## 5. 版本号策略

`pom.xml` 的 `<version>` 是**二开基线版本**。2026-10-28 起基线已切到 `3.0.0`，与上游 `源码/master` 一致。

上游每次合并仍会自动带入 `pom.xml` 版本号——现在带入的就是 `3.0.0`，无需手工改回。
**例外**：若上游发布 `3.1.0` 等新版本而本地数据库尚未迁移到位，合并后需把版本号改回本地实际基线，
否则产物名与数据库脚本版本会不一致。

基线切换已完成的事项（后续再切换时参考）：

1. 三方言初始化 + 两套更新脚本都已补 `wvp_user_channel`
2. `secret` 列宽度：部署副本（`script/sql/`）是 `varchar(255)`，`数据库/3.0.0` 源脚本仍是 50，
   由副本承载加宽修正
3. 现网库需执行 `数据库/3.0.0/更新-*.sql`
4. 脚本命名、README、部署文档已同步

## 5.1 每次合并后必须复查

`wvp_user_channel` 是二开独有表，上游脚本不含它。合并上游后执行：

```bash
grep -c wvp_user_channel 数据库/3.0.0/初始化-*.sql 数据库/3.0.0/更新-*.sql
# 每个文件应 ≥ 1；为 0 说明上游覆盖了脚本，需重新补表
```

## 6. 提交前检查清单

```bash
# 1. 无未解决冲突
git diff --name-only --diff-filter=U

# 2. 暂存区不含危险文件
git diff --cached --name-only | grep -E 'application-dev\.yml|^\$null|\.bak\.|^文档/'
# 必须无输出（文档/ 含明文账号口令，会被推到公开 fork）

# 3. 用显式路径 git add，禁止 git add -A / git add .
git add <file1> <file2> ...

# 4. 构建验证
cd web && npm run build:prod
mvn -o -Dmaven.repo.local=D:/MavenReposity -DskipTests clean package
```

## 7. 构建环境（本机）

| 项 | 值 |
|---|---|
| JDK | `D:/AppSpace/JDK/jdk-21.0.6` |
| Maven | `/d/AppSpace/maven/apache-maven-3.9.16/bin/mvn`（已在 PATH） |
| 本地仓库 | `D:/MavenReposity`（`-Dmaven.repo.local`） |
| 离线构建 | 加 `-o`（依赖已齐备） |

`pom.xml` 硬编码 `<skipTests>true</skipTests>`，`-DskipTests=false` 无效；
但 **test-compile 仍会编译测试**，解冲突不彻底会在该阶段暴露。

## 8. 回滚

| 阶段 | 方式 |
|---|---|
| 合并冲突未解决 | `git merge --abort` |
| 已合并未验证 | `git reset --hard <合并前 SHA>` |
| 已合回 main 未 push | `git reset --hard <合并前 main SHA>` |
| 已 push | `git revert -m 1 <merge-commit>`（不改写历史） |
