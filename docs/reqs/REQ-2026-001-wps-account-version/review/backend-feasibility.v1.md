# 后端可行性评审 · REQ-2026-001 · v1

- **评审员**：backend-feasibility
- **时间**：2026-07-02T16:00+08:00
- **判定**：**pass-with-conditions** ⚠️

## 1. 归属与影响面

- **新增**：`server/src/modules/auth`（注册/登录/改密码/session）、`packages/shared` 里的 auth 事件与错误码、版本目录配置（放 `packages/shared` 或 `packages/engine/config`）。
- **扩展**：
  - `server/src/modules/room/room.service.ts`：`Room` 数据结构加 `version` 字段，`create/join` 按版本读容量。
  - `server/src/modules/chat/chat.service.ts`：新增 lobby 频道；房间频道现有实现保留。
  - `server/src/gateway/game.gateway.ts`：连接前置 auth guard，未登录不允许建立业务 socket。
  - `packages/shared/src/index.ts`：`MAX_ROOM_PLAYERS = 10` 常量要**降级为默认值**，实际以版本目录为准。
- **不动**：`packages/engine`（规则引擎）、对局流程。

## 2. 状态 & 一致性

- 新增持久化：**用户表**（QQ 邮箱、密码 hash、盐、创建时间、最后登录时间、当前偏好版本）。**当前仓库尚未看到数据库层**（现状是内存 room / 内存 chat）。
  - **提醒产品**：这是重要新增。选型倾向 SQLite（本地开发零依赖）+ 生产切 Postgres；也可以先落 JSON 文件持久化 MVP，design 阶段决定。
- Session 机制建议：JWT + 短期（1h）+ refresh（7d）；或 httpOnly Cookie + server-side session（内存 Map），后者对现有 gateway 更自然。
- 大厅聊天消息**不持久化**（一次性 fan-out），只保留最近 N 条内存滚动窗口，避免存储成本；PRD 未说明是否需要历史，需要澄清。
- 房间携带版本后：`Room` 结构增加 `version: VersionId`；创建时快照，加入时校验；对既有内存 room（若服务在运行）**做兼容**（老 room 视为 `standard-2014`）。

## 3. 事件时序

新增或扩展的 socket / http 事件量级：**约 6–8 条**。

- HTTP：`POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`POST /auth/change-password`。
- Socket：`lobby:chat:send / lobby:chat:message`、`version:switch`、`version:list`、`room:list`（现有事件扩展 filter by version）。
- Gateway 中间件：`handshake.auth.token` 校验；无效 token 直接断连并给 `E_UNAUTHORIZED`。

## 4. 性能 / 安全

- 登录：bcrypt 12 轮 → 单次 100–200ms，符合 P95 200ms 目标；建议加 IP 限流（10 次/分）。
- 大厅聊天广播：内存 fan-out 无问题；需要"发送节流"（例如 1 条/秒/账号）防刷屏。
- 反作弊：本期只需防"未登录发消息 / 未登录建房"，通过 auth guard 即可。
- 敏感数据：密码只落哈希，日志脱敏；session token 不写业务日志。

## 5. 成本 & 风险

- 粗估成本：**3–5 人日**（大头在 auth 模块 + 存储选型 + gateway 中间件）。
- Top 3 风险：
  1. **存储层从无到有**：当前仓库看起来没有数据库依赖，本次需要引入。若选 SQLite 需要考虑并发写；若选内存需要在文档明说"重启数据丢失"。**必须在 design 阶段落死**。
  2. **老 sandbox 昵称流兼容**：`/sandbox` + 匿名昵称 vs 强制账号 → 决策见前端评审员条件 1。
  3. **版本切换的一致性**：账号偏好版本更新事件如果没广播，房间列表在多标签页会不同步；建议 `version:switched` 事件广播到本账号所有 socket。

## 6. 通过条件（PRD 需补齐）

1. 大厅聊天是否需要历史消息（离线后重进能看到之前 N 条）？**建议**：不需要，只滚动 100 条内存缓存。
2. sandbox 房是否强制登录？→ 建议：登录后可进。
3. 数据持久化：MVP 是否接受 SQLite / JSON 文件？（design 会给方案，但产品要给个偏好）。
4. 修改密码是否强制登出所有 session？PRD 已说"重新登录"，请明确"其他标签页也失效"。

## 7. 判定

`pass-with-conditions`：无技术上不可行的地方，主要卡在"存储选型 + sandbox 兼容 + 大厅历史"三处澄清。
