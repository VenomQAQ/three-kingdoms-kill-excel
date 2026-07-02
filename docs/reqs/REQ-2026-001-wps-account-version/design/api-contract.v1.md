# API / 事件契约 · REQ-2026-001 · v1  [SSOT]

- **状态**：`version: v1`，`frozen: true`（前端 design v1 消费无异议后冻结；2026-07-02T18:20+08:00）
- **作者**：backend-design
- **时间**：2026-07-02T18:00+08:00
- **约束**：一旦 `frozen: true`，任何变更走 CR；前端只读消费，禁止业务代码里私自添加字段
- **命名风格**：延续现有仓库 `namespace:action` socket 事件；HTTP 路径 `/api/<domain>/<verb>`

## 0. 通用约定

### 0.1 载体

- **Access Token**：JWT，放 **httpOnly Cookie** `tk_at`（`SameSite=Lax; Secure` 生产开）；socket handshake 自动带 Cookie；HTTP 请求也自动带。
- **Refresh Token**：不透明 opaque token，放 **httpOnly Cookie** `tk_rt`，仅 `/api/auth/refresh` 路径可见（Path 限定）；每次刷新旋转。
- **Anonymous**：无 `tk_at` 也允许 socket 连接（用于未登录只读浏览）；服务端根据 auth 状态给不同事件权限。

### 0.2 版本号

- 顶层字段 `_v: 1`，写在每个 http 响应体、每个 socket payload 顶层；用于后续升版兼容判断。

### 0.3 错误响应统一格式

HTTP：

```ts
type ErrorBody = { ok: false; code: string; message: string; details?: unknown; _v: 1 };
```

Socket：`room:error` / `auth:error` / `chat:error` 等按 domain 拆的错误事件，payload：

```ts
type SocketError = { code: string; message: string; scope: string; _v: 1 };
```

### 0.4 全量错误码枚举

| code | 含义 | 触发点 |
|---|---|---|
| `E_UNAUTHORIZED` | 未登录/token 过期 | 需登录的接口/事件 |
| `E_FORBIDDEN` | 权限不足 | 例：非房主 start |
| `E_BAD_CREDENTIALS` | 邮箱或密码错 | `/auth/login` |
| `E_USER_EXISTS` | 邮箱已注册 | `/auth/register` |
| `E_INVALID_EMAIL` | 邮箱格式非法（非 QQ 邮箱） | `/auth/register` / login |
| `E_WEAK_PASSWORD` | 密码不符合规则 | `/auth/register` / change-password |
| `E_PASSWORD_MISMATCH` | 原密码错 / 新密码与确认不一致 | `/auth/change-password` |
| `E_REFRESH_EXPIRED` | refresh 过期或已作废 | `/auth/refresh` |
| `E_REFRESH_REUSED` | 检测到旧 refresh 复用 → 全账号踢下线 | `/auth/refresh` |
| `E_LOGIN_RATE_LIMIT` | 登录失败限流命中 | `/auth/login` |
| `E_ROOM_NOT_FOUND` | 房间号不存在 | `room:join` |
| `E_ROOM_FULL` | 房间人数已达版本上限 | `room:join` / `room:create` |
| `E_ROOM_STARTED` | 房间已开局，不接受加入 | `room:join` |
| `E_ROOM_VERSION_MISMATCH` | 加入者当前版本与房间版本不符 | `room:join` |
| `E_VERSION_UNKNOWN` | 未知版本号 | `version:switch` / `room:create` |
| `E_CHAT_RATE_LIMIT` | 大厅聊天 > 1 条/秒/账号 | `lobby:chat:send` |
| `E_CHAT_TOO_LONG` | 单条 > 200 字符 | `lobby:chat:send` |
| `E_CHAT_MUTED` | 未登录尝试发言 | `lobby:chat:send` |
| `E_SANDBOX_DISABLED` | 生产环境访问 sandbox | `room:sandbox`（若命名） / `/sandbox` |
| `E_INTERNAL` | 服务端未分类错误 | 兜底 |

---

## 1. HTTP · 认证域 `/api/auth/*`

### 1.1 `POST /api/auth/register`

- 请求
  ```ts
  { email: string; password: string; nickname: string; _v: 1 }
  ```
- 校验
  - `email` 必须匹配 `^\d{5,11}@qq\.com$`
  - `password` 长度 8-32，至少一个字母 + 一个数字
  - `nickname` 1-20 字符，前后 trim
- 成功响应
  ```ts
  { ok: true; data: { userId: string; email: string; nickname: string }; _v: 1 }
  ```
  同时 Set-Cookie `tk_at` + `tk_rt`（即注册即登录）
- 失败：`E_INVALID_EMAIL` / `E_WEAK_PASSWORD` / `E_USER_EXISTS`

### 1.2 `POST /api/auth/login`

- 请求 `{ email: string; password: string; _v: 1 }`
- 成功响应
  ```ts
  { ok: true; data: { userId: string; email: string; nickname: string; preferredVersion: string }; _v: 1 }
  ```
  Set-Cookie `tk_at` + `tk_rt`
- 失败：`E_BAD_CREDENTIALS` / `E_LOGIN_RATE_LIMIT`
- 限流：10 次失败/分钟/IP + 5 次失败/小时/email

### 1.3 `POST /api/auth/logout`

- 请求：无 body
- 成功：清空 `tk_at` / `tk_rt` Cookie；服务端 revoke 当前 refresh
- 响应：`{ ok: true; _v: 1 }`
- 不校验 access（幂等）

### 1.4 `POST /api/auth/change-password`

- 请求 `{ oldPassword: string; newPassword: string; _v: 1 }`
- 校验：需要有效 access
- 成功后：
  - 该 userId **所有 refresh token 作废**（数据库标记）
  - 所有已连接 socket 发送 `auth:invalidated`（见 §3）并断连
  - 响应：`{ ok: true; _v: 1 }`（前端随后跳登录页）
- 失败：`E_UNAUTHORIZED` / `E_PASSWORD_MISMATCH` / `E_WEAK_PASSWORD`

### 1.5 `POST /api/auth/refresh`

- 请求：仅需 `tk_rt` Cookie
- 成功：**旋转** refresh token（旧作废，新写 Cookie），签新 access
- 响应：`{ ok: true; data: { expiresIn: 3600 }; _v: 1 }`
- 失败：`E_REFRESH_EXPIRED`（正常过期）/ `E_REFRESH_REUSED`（检测到旧 token 复用 → **同账号所有 refresh 立即拉黑**，所有 socket 收 `auth:invalidated`）
- **并发竞态**：同一 refresh 并发两次 → 第一次胜出，第二次收到 `E_REFRESH_REUSED` **不触发全账号拉黑**（这是"重复请求"，不是"盗刷"）；服务端用 refresh 的 `familyId + generation` 计数区分：
  - `generation < latest` 且间隔 ≤ 5 秒 → 视为重复请求，只返回错误不拉黑
  - `generation < latest` 且间隔 > 5 秒 → 视为盗刷，拉黑

### 1.6 `GET /api/auth/me`

- 校验：需要有效 access
- 响应：`{ ok: true; data: { userId, email, nickname, preferredVersion }; _v: 1 }`
- 前端页面挂载时调用；`E_UNAUTHORIZED` 则未登录状态

---

## 2. HTTP · 环境能力域 `/api/capabilities`

### 2.1 `GET /api/capabilities`

- 不需要登录
- 响应
  ```ts
  {
    ok: true;
    data: {
      sandboxEnabled: boolean;                     // 环境变量 SANDBOX_ENABLED
      versions: Array<{
        id: string;                                // 'standard-2014'
        name: string;                              // '三国杀标准版·界限突破'
        minPlayers: number;                        // 2
        maxPlayers: number;                        // 10
        default: boolean;                          // 是否默认版本
      }>;
      bgColorToken: string;                        // R-2 判据用：QA 读取此颜色做像素扫描
      chatLimits: { ratePerSec: 1; maxLength: 200; historySize: 1000; snapshotSize: 100 };
      session: { accessTtlSec: 3600; refreshTtlSec: 604800; reconnectGraceSec: 300 };
    };
    _v: 1;
  }
  ```
- 前端启动时调用一次，缓存到 `appStore.capabilities`

---

## 3. Socket · 全局事件（不分域）

### 3.1 server → client `auth:invalidated`

- payload `{ reason: 'password-changed' | 'refresh-reused' | 'admin-revoke'; _v: 1 }`
- 触发后服务端主动断开连接；前端清空本地 auth，跳登录页

### 3.2 server → client `auth:hello`

- payload `{ userId: string | null; nickname: string | null; preferredVersion: string; _v: 1 }`
- 连接建立后服务端第一条事件；`userId: null` 表示匿名连接

---

## 4. Socket · 版本域

### 4.1 `client → server` `version:switch`

- 需登录
- payload `{ versionId: string; _v: 1 }`
- 服务端行为：更新 `user.preferredVersion`；对该 userId 的所有 socket 广播 `version:switched`
- 失败：`E_VERSION_UNKNOWN`

### 4.2 `server → client` `version:switched`

- payload `{ versionId: string; _v: 1 }`

---

## 5. Socket · 大厅聊天域

### 5.1 `client → server` `lobby:chat:send`

- 需登录
- payload `{ content: string; _v: 1 }`
- 服务端：
  - 长度校验 ≤ 200 字符（Unicode 码点计数，超过返回 `E_CHAT_TOO_LONG`）
  - 限流：**滑动窗口** 1 秒 1 条/账号，超出返回 `E_CHAT_RATE_LIMIT`
  - 存入 SQLite（滚动窗口 1000）；成功后广播 `lobby:chat:message`
- 失败事件：`chat:error` `{ code, message, scope: 'lobby' }`

### 5.2 `server → client` `lobby:chat:message`

- payload
  ```ts
  {
    id: string;              // ULID
    userId: string;
    nickname: string;
    content: string;
    ts: number;              // epoch ms
    _v: 1;
  }
  ```

### 5.3 `client → server` `lobby:chat:snapshot`

- 无需登录（未登录可只读）
- payload `{ _v: 1 }`
- ack 回调 `(messages: LobbyChatMessage[]) => void`，返回最近 **100** 条（时间升序）
- **顺序保证**：客户端连接后应先 `snapshot` 再订阅 `lobby:chat:message`；服务端保证 snapshot 快照时刻之前的所有消息都在快照里，之后到达的通过 `lobby:chat:message` 推送；客户端按 `id` 去重（防止快照 + 推送有重叠）

---

## 6. Socket · 房间域（扩展）

### 6.1 `client → server` `room:list`

- 无需登录（未登录只读）
- payload `{ versionId?: string; _v: 1 }`
- ack `(rooms: RoomBrief[]) => void`

```ts
type RoomBrief = {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  playerCount: number;
  maxPlayers: number;       // 从版本目录读
  ownerNickname: string;
  versionId: string;
  note?: string;
  _v: 1;
};
```

### 6.2 `client → server` `room:create`（扩展）

- 需登录
- payload `{ versionId: string; note?: string; _v: 1 }`（不再接收 nickname；从 auth 取）
- 失败：`E_UNAUTHORIZED` / `E_VERSION_UNKNOWN` / `E_ROOM_FULL`（超版本上限）
- 成功：ack `{ ok: true; room: Room; _v: 1 }`

### 6.3 `client → server` `room:join`（扩展）

- 需登录
- payload `{ code: string; _v: 1 }`
- 失败：`E_ROOM_NOT_FOUND` / `E_ROOM_FULL` / `E_ROOM_STARTED` / `E_ROOM_VERSION_MISMATCH`
- 版本一致性：加入者当前 `preferredVersion` 必须等于房间 `versionId`，否则前端先本地切版本再重发

### 6.4 断线保坐

- 服务端行为：任一玩家 socket 断开，服务端 5 分钟内保留其在 `RoomService` / `GameService` 的座位与引擎绑定；同 `userId` 再次连接时自动认领；超时按现有断线策略处置
- `reconnectGraceSec` = 300（暴露在 `/api/capabilities`）
- **改密触发的 auth:invalidated 不受 5 分钟保护**，立即回收座位

### 6.5 其余房间事件不变

沿用现有 `room:leave` / `room:ready` / `room:start` / `room:state` / `room:error` / `room:playerLeft` / `game:started`。改动仅在于：payload 顶层加 `_v: 1`；`room:error.code` 遵循本契约 §0.4 枚举。

---

## 7. Socket · 房间内聊天域

沿用现有 `chat:send` / `chat:message` / `chat:history`。改动：payload 顶层加 `_v: 1`；仅登录用户可 `chat:send`。

---

## 8. Sandbox 域（受 `sandboxEnabled` 门控）

现有 sandbox 事件在 `sandboxEnabled=false` 时**gateway 层不挂载对应 handler**，前端调用得到 `E_SANDBOX_DISABLED`（gateway 兜底）；`true` 时保留现有行为但要求登录。

---

## 9. Dev-Only · 时间控制（测试基础设施）

仅当 `process.env.ENABLE_DEBUG_CLOCK === 'true'` 时挂载：

### 9.1 `POST /api/debug/advance-clock`

- 请求 `{ seconds: number; _v: 1 }`
- 用途：QA 快进 access / refresh 过期，避免真实等待
- 生产必须关闭；capabilities 端点不暴露此接口

---

## 10. 顺序 & 幂等保证

- 服务端保证同一 userId 的所有 socket 事件顺序（同 socket 内 FIFO，跨 socket 无保证）
- 客户端应按 `id` 或 `ts` 处理消息，容忍轻微乱序
- 所有写操作（登录、注册、改密、聊天）**天然非幂等**，客户端不重试；网络重试仅限 GET 类

---

## 11. 冻结前待前端 design 确认的点

（design 联合评审时对齐后再置 `frozen: true`）

1. **auth:hello 是否合适放"版本"字段**（还是走 capabilities + `/auth/me`）？→ 当前设计放了 `preferredVersion`，避免前端两次 fetch
2. **room:list 是否包含大厅聊天字段**？→ 不包含，二者独立事件
3. **chat message 是否需要 `type: 'system' | 'user'`**？→ 本期只有 user，后续加系统消息再扩
4. **refresh 竞态 5 秒窗口**是否需要在 capabilities 暴露？→ 暂不暴露，后端内部行为

---

## 12. 变更日志

- **v1** · 2026-07-02 · 初版，`frozen: false`
