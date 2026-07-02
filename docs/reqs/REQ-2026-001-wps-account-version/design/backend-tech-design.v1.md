# 后端技术方案 · REQ-2026-001 · v1

- **作者**：backend-design
- **时间**：2026-07-02T18:00+08:00
- **契约参考**：[api-contract.v1.md](./api-contract.v1.md)

## 1. 架构决策

### 1.1 目录

```
server/src/
├── modules/
│   ├── auth/                       ← 新增
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts         ← register / login / logout / changePassword
│   │   ├── token.service.ts        ← access(JWT) + refresh(opaque + rotation)
│   │   ├── password.service.ts     ← argon2id 封装
│   │   ├── auth.controller.ts      ← /api/auth/*
│   │   ├── auth.guard.ts           ← http guard + socket guard
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       └── refresh-token.entity.ts
│   ├── capabilities/               ← 新增
│   │   └── capabilities.controller.ts    ← /api/capabilities
│   ├── version/                    ← 新增
│   │   ├── version.module.ts
│   │   └── version.registry.ts     ← 读 packages/shared/config/versions
│   ├── lobby-chat/                 ← 新增
│   │   ├── lobby-chat.gateway.ts   ← socket 事件
│   │   ├── lobby-chat.service.ts   ← 存储 + 滚动 + 限流
│   │   ├── rate-limiter.ts         ← 滑动窗口
│   │   └── entities/
│   │       └── lobby-chat-message.entity.ts
│   ├── room/                       ← 扩展（加 version 字段 + 断线保坐 5min）
│   │   ├── room.service.ts (改)
│   │   └── room.entity.ts (无持久化，内存 map；不需 ORM 实体)
│   ├── chat/                       ← 沿用；仅登录用户可 send
│   ├── game/                       ← 不动
│   └── debug/                      ← 仅 ENABLE_DEBUG_CLOCK=true 挂载
│       └── clock.controller.ts     ← /api/debug/advance-clock
├── gateway/
│   └── game.gateway.ts (改)         ← 加 auth 中间件；根据 sandboxEnabled 挂/不挂 handler
└── main.ts (改)                     ← 引入 typeorm 初始化 & cookie-parser
```

**新增依赖**：

- `@nestjs/typeorm` + `typeorm` + `better-sqlite3`
- `argon2`（密码哈希）
- `cookie-parser`（http 层读 Cookie）
- `jsonwebtoken`（access JWT）
- `ulid`（消息 id）

### 1.2 存储

- **文件位置**：`server/data/app.sqlite`（生产可以走 volume 挂载）
- **.gitignore** 追加 `server/data/`
- **表清单**：`user` / `refresh_token` / `lobby_chat_message`
- **TypeORM synchronize=false**：首次上线通过 `npm run migration:run` 生成表；本仓库暂用 `synchronize=true`（MVP）+ 一个初始 migration；由 backend-coder 在实现时定。

### 1.3 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SANDBOX_ENABLED` | `false` | 是否挂载 sandbox handler + capabilities 暴露 |
| `ENABLE_DEBUG_CLOCK` | `false` | 是否挂载 /api/debug/advance-clock |
| `JWT_ACCESS_SECRET` | (必填) | access token 签名 |
| `JWT_ACCESS_TTL_SEC` | `3600` | access 有效期 |
| `REFRESH_TTL_SEC` | `604800` | refresh 有效期 |
| `RECONNECT_GRACE_SEC` | `300` | 断线保坐 |
| `COOKIE_SECURE` | `false` | 生产设 `true` |

## 2. 状态与时序

### 2.1 认证时序

```
[client]  POST /api/auth/login {email,pwd}
          ↓
[auth]    verify (argon2.verify)
          ↓
[token]   sign access(JWT, 1h) + issue refresh(opaque, 7d, familyId=uuid, gen=0)
          ↓
[server]  Set-Cookie tk_at (Path=/) + tk_rt (Path=/api/auth/refresh)
[server]  socket adapter 若已连接，广播 auth:hello 更新 userId
```

### 2.2 Refresh 旋转

```
[client]  POST /api/auth/refresh (Cookie tk_rt)
          ↓
[token]   verify opaque token
          若 revoked=true：
             若 (now - revokedAt) ≤ 5s → 视为重复请求，返 E_REFRESH_REUSED，不拉黑
             否则 → 视为盗刷，revokeFamily(familyId)，返 E_REFRESH_REUSED
          若 exp<now → E_REFRESH_EXPIRED
          否则：
             mark current revoked, generation+=1
             issue new refresh (same familyId, gen+1)
             sign new access
             Set-Cookie tk_at + tk_rt
```

### 2.3 改密广播

```
[auth.changePassword]
  → hash new password, update user
  → refreshTokenRepo.revokeAllByUserId(userId)
  → gateway.emitToUser(userId, 'auth:invalidated', {reason:'password-changed'})
  → gateway.disconnectByUser(userId)
```

### 2.4 断线保坐

```
gateway.onDisconnect(socket):
  if (socket.userId && socket.roomCode):
    scheduleReclaim(userId, roomCode, delay = RECONNECT_GRACE_SEC * 1000)
      → 到期若未认领：调用 RoomService.leaveByUserId(userId, roomCode)

gateway.onConnect(socket, auth):
  if (socket.userId && hasPendingReclaim(userId)):
    cancelReclaim(userId)
    RoomService.rebind(userId, socket)   # 座位、引擎绑定原路返回
```

### 2.5 大厅聊天流程

```
[client] lobby:chat:send {content}
   ↓
[gateway] guard: 需 auth
   ↓
[lobby-chat.service]
   ├── length check ≤ 200
   ├── rateLimiter.tryAcquire(userId)  # 1 QPS 滑动窗口
   └── repo.insert({id: ulid(), userId, nickname, content, ts})
       ├── 若表行数 > 1000：删除最旧 (ts asc, limit N)
       └── emit lobby:chat:message to *（含匿名订阅者）
```

## 3. 并发 / 一致性

### 3.1 房间级并发

- 沿用现有 `RoomService`（内存 Map）。新增写 `room.versionId`；join 时先读 `room.maxPlayers`（版本上限），后 `players.push`——保持"读-加-写"三步在一个同步块内。
- 断线保坐的 `scheduleReclaim` 用 `Map<userId, NodeJS.Timeout>`，同一 userId 若已有 pending，覆盖并清除旧计时器。

### 3.2 Refresh 竞态

见 §2.2 的 5 秒窗口策略。

### 3.3 SQLite 写并发

- `better-sqlite3` 是同步 API，Node 单进程无并发写问题；请求量级下无需 WAL 调优。
- 大厅聊天写入 + 淘汰在单事务：`INSERT` → `DELETE FROM lobby_chat_message WHERE id NOT IN (SELECT id FROM lobby_chat_message ORDER BY ts DESC LIMIT 1000)`（可选：批量删除，或按每 100 条触发一次淘汰）。

## 4. 兼容与迁移

### 4.1 现有 sandbox

- v2 已决定：sandbox 也需登录。删除 `RoomService` 里 "按 nickname 匹配断线重连" 的分支，全部走 userId。
- `SANDBOX_ROOM_CODE = '70755712'` 常量保留，但入口受 `SANDBOX_ENABLED` 控制。
- 保留现有 `/sandbox` 命令，命令处理器根据 `capabilities.sandboxEnabled` 判定是否响应。

### 4.2 现有 `chat:send / chat:message`

- 房间内聊天沿用，payload 顶层增 `_v: 1`；仅登录用户可 send。
- 客户端老代码在过渡期兼容：payload 里可读到 `_v`，无则视为 v0。

### 4.3 `MAX_ROOM_PLAYERS` 常量

- `packages/shared/src/index.ts` 里 `MAX_ROOM_PLAYERS = 10` 保留为 **默认版本上限的 fallback**，仅用于极端异常兜底；实际以 `versionRegistry.get(versionId).maxPlayers` 为准。

## 5. 可观测

- 结构化日志（沿用 Nest Logger，或引入 pino）：
  - `auth.login` / `auth.register` / `auth.change_password` / `auth.refresh.rotate` / `auth.refresh.reused`
  - `lobby.chat.rate_limited` / `lobby.chat.rejected`
  - `room.reclaim.scheduled` / `room.reclaim.executed` / `room.reclaim.cancelled`
- Metric：登录成功/失败计数、大厅聊天 QPS、平均在线人数、断线保坐命中率

## 6. 风险与备选

| 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|
| SQLite 单文件误删导致账号丢失 | 低 | 中 | 生产做每日备份；.gitignore 明确 |
| better-sqlite3 需要原生编译，跨 CI 环境失败 | 中 | 中 | 备选 `libsql`（纯 JS）或 `sql.js`；MVP 用 better-sqlite3 |
| JWT 密钥泄露 | 低 | 高 | 密钥仅从环境变量读，代码里不给默认值；变更后 revokeAll |
| 大厅聊天广播风暴 | 低 | 中 | 限流 1/s；服务端可加房间级 fanout 白名单（本期不做） |
| Refresh 竞态 5 秒窗口误判 | 中 | 低 | 前端拿到 `E_REFRESH_REUSED` 时统一登出，用户体验能接受 |

## 7. 交付顺序建议（给 backend-task）

1. 依赖引入 + typeorm 初始化 + user/refresh_token 表 + 环境变量
2. `auth.service` + `token.service` + `auth.controller`（含 register/login/logout/refresh/me）
3. `auth.guard`（http） + gateway 中间件（socket）
4. `capabilities` 端点
5. `version.registry`（含 `standard-2014`）+ `room` 加 versionId 字段
6. `lobby-chat` 完整栈
7. `changePassword` + `auth:invalidated` 广播
8. 断线保坐（改 `RoomService` + `gateway`）
9. `sandbox` 门控 + `debug/advance-clock`（可选）

每步都要能编译 & 现有 sandbox 测试房不炸。
