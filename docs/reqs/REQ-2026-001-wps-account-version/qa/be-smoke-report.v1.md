# 后端主干 Smoke 验收报告 · v1

- **执行者**：backend-coder + 独立脚本 smoke（沙箱 Linux arm64）
- **执行时间**：2026-07-03
- **对象**：`d4af523` + `3a4f06b` + `HEAD`（BE-1 ~ BE-13 + auth:hello 时机修复）
- **结果**：**38/38 全绿**

## 验收环境

- 沙箱 Linux arm64；`better-sqlite3` 已从源码编译；`argon2` 用官方 prebuild
- 服务：`PORT=3222 JWT_ACCESS_SECRET=verify SANDBOX_ENABLED=false ENABLE_DEBUG_CLOCK=true`
- 数据库：`server/data/verify.sqlite`（每批开跑前 `rm -f` 清空）

## 批 1 · capabilities + auth 参数校验（9/9）

| # | 场景 | 期望 | 实际 |
|---|---|---|---|
| 1 | `GET /api/capabilities` | 200 + 全字段 | ok=true sandbox=false versions=['standard-2014'] bg=--bg-cell chatLim=1000/100/1/200 ✅ |
| 2 | `GET /api/auth/me` 匿名 | 401 | 401 `E_UNAUTHORIZED` ✅ |
| 3 | 注册 12345@qq.com | 201 + tk_at/tk_rt | 201，Cookies 设置 ✅ |
| 4 | 登录后 me | 200 | preferredVersion=standard-2014 ✅ |
| 5 | 重复注册 | 409 `E_USER_EXISTS` | ✅ |
| 6 | 非 QQ 邮箱 | 400 `E_INVALID_EMAIL` | ✅ |
| 7 | 弱密码 | 400 `E_WEAK_PASSWORD` | ✅ |
| 8 | 缺字段 | 400（不 500） | 400 `E_INVALID_EMAIL` ✅ |
| 9 | 错密码 login | 401 `E_BAD_CREDENTIALS` | ✅ |

## 批 2 · refresh 旋转 + 竞态（7/7）

| # | 场景 | 期望 | 实际 |
|---|---|---|---|
| 1 | register 拿 tk_rt | familyId.0.secret 格式 | ✅ |
| 2 | rotate → gen 1 | token 更换 | ✅ 明显变化 |
| 3 | 5s 内复用 gen0 | 401 `E_REFRESH_REUSED`（不拉族） | 401 ✅ |
| 4 | gen1 继续 rotate | 200，家族仍活 | ✅ 生 gen2 |
| 5 | `POST /api/debug/advance-clock {seconds:6}` | 201 + offset=6000 | ✅ |
| 6 | 拨时后再复用 gen0 | 拉族（此刻 revokedAt 距今 >5s） | 401 `E_REFRESH_REUSED` ✅ |
| 7 | 拉族后 gen2 也失效 | 401 | ✅ |

## 批 3 · 改密 + logout + refresh 7d 过期（10/10）

| # | 场景 | 结果 |
|---|---|---|
| 1 | register | 201 ✅ |
| 2 | change-password | 200 ✅ |
| 3 | 改密后 me（cookies 已清） | 401 `E_UNAUTHORIZED` ✅ |
| 4 | 旧密码 login | 401 `E_BAD_CREDENTIALS` ✅ |
| 5 | 新密码 login | 200 ✅ |
| 6 | logout | 200 ✅ |
| 7 | logout 后 me | 401 ✅ |
| 8 | 重新 login 拿 refresh | 200 ✅ |
| 9 | advance-clock 8 天 (691200s) | 201 ✅ |
| 10 | refresh → `E_REFRESH_EXPIRED` | 401 ✅ |

## 批 4 · Socket 事件（12/12）

`server/scripts/smoke-socket.cjs`：两个 socket（一匿名一 tk_at 认证），全流程验证。

| # | 场景 | 结果 |
|---|---|---|
| 1 | 预热 cookie present | true ✅ |
| 2 | anon + authed 双 socket 连接 | both connected ✅ |
| 3 | `auth:hello` anon | `{userId:null,nickname:null,preferredVersion:'standard-2014',_v:1}` ✅ |
|   | `auth:hello` authed | `{userId:'01K...',nickname:'aa',preferredVersion:'standard-2014',_v:1}` ✅ |
| 4 | 匿名 `lobby:chat:snapshot` | ack len=0 ✅ |
| 5 | 匿名 `lobby:chat:send` | `chat:error E_CHAT_MUTED scope:lobby` ✅ |
| 6 | authed 发言 → 广播 | authed + anon 都收到 content='hello lobby' ✅ |
| 7 | 1s 内再发 | `E_CHAT_RATE_LIMIT` ✅ |
| 8 | ≥201 字符 | `E_CHAT_TOO_LONG` ✅ |
| 9 | 再 snapshot | len=1，含刚发的消息 ✅ |
| 10 | `version:switch standard-2014` | 收到 `version:switched` ✅ |
| 11 | 未知版本 | `room:error E_VERSION_UNKNOWN` ✅ |
| 12 | 匿名 `version:switch` | `room:error E_UNAUTHORIZED` ✅ |

## 未在此报告直接验证但已由代码路径覆盖

- **BE-8 断线保坐 5min**：ReconnectService + `RoomService.rebindUserPlayer/evictByUser/markPlayerDisconnected` 在 code review 层已覆盖；需要 UI 场景才能完整闭环，前端 FE-1~FE-11 落地后走 E2E
- **BE-11 sandbox 门控**：因验收环境 `SANDBOX_ENABLED=false`，实际是"沉默地无 handler 挂载"；试图 emit 会走 socket.io middleware 拦截（gateway.afterInit 已注入）；QA 阶段用两组 env（true/false）跑对照
- **改密 `auth:invalidated` 广播断连**：与批 3 [3] 相关，但完整多 tab 场景需要 socket.io-client 长连（沙箱内 argon2 每次 hash 8s，超时无法演完 change-password → tab2 应立即掉），QA 用 mock-clock + 多客户端场景验

## 修复记录（验收期间发现并已修复）

| 编号 | Bug | 修复 |
|---|---|---|
| Fix-1 | `AuthService.register/login/changePassword` 缺字段时 `undefined.trim()` → 500 | 加 `typeof v === 'string' ? v.trim() : ''` 防御，返 400 |
| Fix-2 | `auth:hello` 在 handleConnection 立即 emit，客户端 listener 挂上前已过 | `setImmediate` 延后一拍 + 检查 `client.connected` |
| Fix-3 | `lobby:chat:snapshot` 用 `ack?(rows)` 参数注入形式在 Nest 11 不生效 | 改为 `return this.lobbyChat.snapshot()`（Nest 会自动作为 ack payload） |

## 结论

BE-1 ~ BE-13 主干功能可用。**准入 code review 阶段。**

推荐动作：`backend-code-reviewer` 起 review v1；同时 `frontend-coder` 可开跑 FE-1 / FE-8 / FE-10（无后端依赖），其余 FE 等后端整体 reviewed 后再动。
