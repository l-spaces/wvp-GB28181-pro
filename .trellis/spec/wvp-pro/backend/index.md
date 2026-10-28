# 后端开发规范

> WVP-Pro 后端（Spring Boot 3.4 / Java 21）的编码约定。
> 本目录是 `doc/编程规范.md` 按主题拆解后的可执行版本，所有结论以当前代码库实际状态为准，非理想化规范。

---

## Overview

后端代码根目录：`src/main/java/com/genersoft/iot/vmp/`，共 783 个 Java 文件；测试在 `src/test/java/`，20 个测试类。
入口类 `VManageBootstrap.java`。新代码遵守本目录规范，存量代码逐步靠拢（反例见各篇"存量反例"小节）。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 13 个一级包的职责划分、新增功能落点、命名约定 | Active |
| [Database Guidelines](./database-guidelines.md) | MyBatis 注解 Mapper、`#{}` 强制、多方言 Provider、SQL 脚本版本维护 | Active |
| [Error Handling](./error-handling.md) | `ControllerException`、`GlobalExceptionHandler`、`WVPResult`、异步回调恰好一次 | Active |
| [Quality Guidelines](./quality-guidelines.md) | 禁止模式、并发与状态清理、测试要求、评审清单 | Active |
| [Logging Guidelines](./logging-guidelines.md) | `@Slf4j`、中文模块前缀、级别选择、敏感信息禁记 | Active |
| [通道显示级权限过滤](./channel-permission-filtering.md) | 用户-通道关联的过滤契约、两套 ID 约定、注入点清单、级联删除语义 | Active |
| [上游合并契约](./upstream-merge-contract.md) | 源码→二开合并的远程约定、冲突策略、静默陷阱、构建与提交检查清单 | Active |
| [部署手册](./deployment-runbook.md) | 开发机构建、CY-PC/WSL2 部署流程、数据库迁移陷阱、验证清单、回滚 | Active |

---

## 使用方式

1. **动手前**读对应主题的规范，不要只看文件名猜内容。
2. 每篇都标了真实代码位置，可直接跳转核对。
3. "存量反例（不要模仿）"是已确认的历史问题，不要当成模板。
4. 发现规范与代码不一致时，以代码为准并更新规范——不要写理想化的规则。

---

**Language**: 中文（技术术语、类名、方法名、配置项保持原文）。
