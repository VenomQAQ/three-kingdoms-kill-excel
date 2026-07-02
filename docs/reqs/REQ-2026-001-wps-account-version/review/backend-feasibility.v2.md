# 后端可行性复核 · REQ-2026-001 · v2

- **评审员**：backend-feasibility
- **时间**：2026-07-02T17:30+08:00
- **判定**：**pass** ✅
- **v1 参考**：[backend-feasibility.v1.md](./backend-feasibility.v1.md)

## 1. 复核范围

对 v1 提出的 4 条条件在 v2 的落实情况：

| v1 条件 | 是否消解 | v2 落点 | 备注 |
|---|---|---|---|
| 大厅是否需历史 | ✅ | §4.4 | 1000 条 SQLite 滚动 + 首拉 100，明确到量级 |
| sandbox 是否强制登录 | ✅ | §4.8 | 环境变量 + 登录，后端加中间件即可 |
| 存储偏好 | ✅ | §6 | 明确 SQLite（MVP），后续可切 Postgres |
| 改密后 session 处理 | ✅ | §4.2 R-5 | 全部失效 + `auth:invalidated` 广播 |

## 2. 新增/修订项对后端的影响

- **§5.2 双 token + 5min 保坐**：`server/src/modules/auth` 增 `TokenService`（access / refresh 分开签发 + refresh 旋转 + 黑名单）；`gateway/game.gateway` 中间件校验 access；断线保坐借助现有 `RoomService` 的玩家状态，加 5 分钟计时器与自动清理。工作量 +1 人日（含旋转与黑名单逻辑）。
- **§4.2 auth:invalidated 广播**：`auth.service.changePassword` 完成后调用 `TokenService.revokeAll(userId)` → 通过 socket adapter 找到该 userId 的所有活跃 socket，emit `auth:invalidated` 后断开。工作量 +0.5 人日。
- **§4.4 大厅聊天 SQLite 1000 条**：新增 `LobbyChatMessage` 实体 + `LobbyChatService.append(userId, text)` + 滚动淘汰（每次插入后如超过 1000 条则删除最旧）；新增 `getSnapshot(limit=100)`；限流用 in-memory sliding window（1 秒 1 条）+ 长度截断。工作量 +1 人日。
- **§4.7 未登录只读**：Gateway 允许匿名连接但只订阅 `room:list` 和 `lobby:chat:message`（只读），其它事件返回 `E_UNAUTHORIZED`。工作量 +0.3 人日。
- **§4.8 SANDBOX_ENABLED**：环境变量 → 在 `capabilities` HTTP 端点回传；生产 build 时 sandbox 相关的 socket 事件也在 gateway 里根据 flag 挂/不挂。工作量 +0.3 人日。
- **§6 SQLite**：仓库当前无 ORM 依赖，需引入 `typeorm` + `better-sqlite3` 或 `prisma`；`server/data/*.db` 加 `.gitignore`；docker-compose 中给出可切 Postgres 的注释。工作量 +1 人日（含初始 schema 与迁移）。

## 3. 契约层需明确（design 阶段处理，不阻断复核）

- 错误码：`E_UNAUTHORIZED` / `E_CHAT_RATE_LIMIT` / `E_CHAT_TOO_LONG` / `E_VERSION_UNKNOWN` / `E_ROOM_FULL` / `E_BAD_CREDENTIALS`。
- Access token 载体：Cookie httpOnly 还是 Authorization header？`backend-design` 定；建议 Cookie（更贴合 socket handshake），但 refresh 走 Body。
- Refresh 旋转策略：每次 refresh 返回新的 refresh token，旧 token 立即拉黑；连续复用旧 token 触发**全账号失效**（防盗）。
- Chat snapshot 事件顺序：`lobby:chat:snapshot` 一定先于 `lobby:chat:message`；客户端按 `id` 去重。

## 4. 更新后的成本 & 风险

- 更新后粗估：**5–7 人日**（v1 3–5，净 +2 主要来自 ORM 引入 + token 旋转 + 保坐计时器）。
- 风险变动：
  - **ORM 引入是重活**：仓库首次接入数据库，schema 迁移与本地文件路径需要仔细处理；建议 dev/prod 都用 SQLite，避免多份配置。
  - **断线保坐 5min 与现有房间实现的对齐**：现有 `RoomService` 已有断线重连逻辑（按昵称匹配），要改为按 `userId` 匹配；同时保留 sandbox 匿名分支（若 sandbox 允许匿名，则 sandbox 走旧逻辑）——**v2 §4.8 已经明确 sandbox 也需登录**，可以彻底切到 userId 匹配，减少代码分支。
  - Refresh 旋转的边缘情况（并发刷新）需要在契约里描述"竞态时的取胜策略"，`backend-design` 阶段解决。

## 5. 判定

**pass** ✅：v1 提出的 4 条 PRD 层条件均已在 v2 落定；成本上升可接受，风险已在 §4 记录并均有解法。可进入 `②已通过`。
