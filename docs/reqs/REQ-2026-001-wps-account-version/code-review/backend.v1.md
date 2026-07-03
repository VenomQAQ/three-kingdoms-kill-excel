# 后端代码评审 · REQ-2026-001 · v1 · 第 1 轮

- **评审员**：backend-code-reviewer
- **时间**：2026-07-03T11:30+08:00
- **审阅范围**：BE-1 ~ BE-13 全部代码（commit `d4af523`、`3a4f06b`、`9d49353`）
- **参考**：`design/api-contract.v1.md`（frozen） / `design/backend-tech-design.v1.md` / `qa/be-smoke-report.v1.md`

## 结论

- **verdict：changes-requested**
- 主干功能可用，smoke 38/38 全绿；但发现 **3 项 blocking**（安全 + 生产隐患），必须修
- 另有 **6 项 non-blocking 建议**、**2 项复审需要跟进的疑点**
- 修完 blocking 后进入第 2 轮复审即可 pass

## 维度打分

| # | 维度 | 结论 | 备注 |
|---|---|---|---|
| 1 | 契约一致性 | **pass** | HTTP 路径 / 事件名 / payload 顶层 `_v:1` / 错误码枚举全部对齐 `api-contract.v1.md` §0.4 §1 §3 §4 §5 §6 |
| 2 | 架构落点 | **pass** | 目录与 design §1.1 一致；auth / capabilities / lobby-chat / debug 拆得干净；ReconnectService 放 room 模块合理 |
| 3 | 正确性 | **pass** | Token 竞态 5s grace + >5s 拉族独立 smoke 全过；socket 广播时机通过 setImmediate 修复；lobby chat 长度用 Unicode 码点计数无代理对错误 |
| 4 | 健壮性 | **risk** | 详见 blocking-2 / suggest-3 |
| 5 | 安全 | **fail** | 详见 blocking-1、blocking-3 |
| 6 | 可读性 | **pass** | 中文注释齐、变量名清晰、无魔法数（限流/window 都是命名常量） |
| 7 | 测试 | **risk** | 尚无 Jest 单元测试；smoke 报告代替；建议 backend-unit-tester 补齐关键路径 |
| 8 | 依赖/引入 | **pass** | typeorm/argon2/jsonwebtoken/ulid/cookie-parser 均是社区主流稳定版本；无可疑包 |
| 9 | 兼容性 | **risk** | 详见 suggest-2（老 sandbox nickname 分支残留） |
| 10 | 性能 | **pass** | 大厅聊天写入 evictOld 用 count() 频次极低（10% 概率），无热路径 N+1；SQLite 单进程无并发写问题 |

## 必改（blocking）

### blocking-1 · JWT 默认签名密钥危险

**文件**：`server/src/config/env.ts:29`

```ts
jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-insecure-secret-change-me',
```

若生产误未设 `JWT_ACCESS_SECRET`，服务会以**硬编码字符串**签发 access token，任何知道该字符串的人可伪造任意 userId 的 access。字符串本身"看着人畜无害"，但已提交进 git，攻击面为**永久公开**。

**必改**：

- 生产环境（`NODE_ENV=production`）**必须启动时校验**：若无 `JWT_ACCESS_SECRET`，直接 `throw` 并退出，禁止用默认值
- dev 环境可保留 fallback，但改为 boot 时打印大字号警告，避免"以为设过了实际没设"
- 参考实现：`env.ts` 里加一段 `if (env.nodeEnv === 'production' && !process.env.JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET must be set in production');`

### blocking-2 · 断线保坐里 `bindUserPlayer` 副作用位置错误

**文件**：`server/src/gateway/game.gateway.ts:82-96`

```ts
if (auth.userId) {
  const cancelled = this.reconnect.cancelReclaim(auth.userId);
  if (cancelled) {
    const oldPlayerId = this.roomService.getPlayerIdByUser(auth.userId);
    if (oldPlayerId) {
      const room = this.roomService.rebindUserPlayer(auth.userId, oldPlayerId, playerId);
      ...
    }
  }
  this.roomService.bindUserPlayer(auth.userId, playerId);   // ← 无条件覆盖
}
```

**问题**：同账号双 tab 场景下（tab1 已在房间，tab2 新登录），tab2 的 `handleConnection` 会**无条件覆盖** `userPlayer[userId] = tab2.playerId`。此时若 tab1 断线，`getPlayerIdByUser(userId)` 返回的是 tab2 的 playerId，`markPlayerDisconnected(tab1.playerId)` 里 `getRoomOfPlayer(tab1.playerId)` 拿不到 room（因为 room 里存的是 tab1.playerId，但 userPlayer 已被 tab2 覆盖）——不过 room.players 里还是 tab1，所以 `markPlayerDisconnected` 用的是 `playerId`（tab1）而非 userId 查找，逻辑不会立即崩，但 5min 到期后 `evictByUser(userId)` 拿到的是 tab2.playerId，会错误地把**在线的 tab2** leave 掉。

**必改**：改成"只在无绑定或本次是首次绑定时才写"，或"每次绑定前先把老的记录一次 tab2 独立映射"。最小修改：

```ts
// 只在 rebind 成功 or 老映射不存在时才更新
const alreadyBound = this.roomService.getPlayerIdByUser(auth.userId);
if (!alreadyBound || cancelled) {
  this.roomService.bindUserPlayer(auth.userId, playerId);
}
```

或者更彻底：`userPlayer` 改成 `Map<userId, Set<playerId>>` 支持多连接。本期至少先满足"同账号只 1 个活跃 tab 时正确"，多 tab 支持列到后续需求。

### blocking-3 · Sandbox middleware 装到 io 命名空间外，可能不生效

**文件**：`server/src/gateway/game.gateway.ts:65-76`

```ts
afterInit() {
  this.socketAuth.bindServer(this.server as unknown as Server);
  (this.server as unknown as Server).use((socket, next) => {
    socket.use((packet: any, nextEvent) => {
      const eventName = Array.isArray(packet) ? String(packet[0] ?? '') : '';
      if (!env.sandboxEnabled && eventName.startsWith('sandbox:')) {
        (socket as any).emit('room:error', { code: 'E_SANDBOX_DISABLED', message: '测试房未启用' });
        return;
      }
      nextEvent();
    });
    next();
  });
}
```

**问题**：`this.server` 在 Nest gateway 里默认是 **root namespace** 的 Server 实例，但若某天有人给 `@WebSocketGateway({ namespace: 'xxx' })` 加了 namespace，middleware 就不会生效。**同时**，`env.sandboxEnabled` 在 middleware 里被**闭包捕获但外层是 `Object.freeze`**——目前是常量所以没事，但**若 sandboxEnabled=true 时**：本项条件 `!env.sandboxEnabled && sandbox:*` 不成立，所有 sandbox handler 正常挂载并接收事件——这里没 bug；**但 sandbox=false 时，所有 handler 也已经在 gateway 上装饰器里挂了**（`@SubscribeMessage('sandbox:xxx')`），middleware 只是**拒绝分发**，socket.io 内部却仍然计入活跃订阅，没什么大问题——**但**若客户端 emit 一个 sandbox 事件后期望 ack，middleware 直接 `return` 而不 nextEvent，客户端**永远收不到 ack**，只收到 `room:error`——设计意图正确，但对于 sandbox 里带 ack 的调用（历史代码里有若干）会 hanging。

**必改**：middleware 的 `return` 前，若 packet 里有回调（`packet[packet.length - 1]` 是 function），主动调用它返回 `{ok:false,code:'E_SANDBOX_DISABLED'}`，避免客户端 hang：

```ts
if (!env.sandboxEnabled && eventName.startsWith('sandbox:')) {
  (socket as any).emit('room:error', { code: 'E_SANDBOX_DISABLED', message: '测试房未启用' });
  const maybeAck = packet[packet.length - 1];
  if (typeof maybeAck === 'function') maybeAck({ ok: false, error: '测试房未启用', code: 'E_SANDBOX_DISABLED' });
  return;
}
```

## 建议（non-blocking）

### suggest-1 · 缺 ValidationPipe

`main.ts` 没有全局 `ValidationPipe`。当前用 `typeof body?.email === 'string' ? ... : ''` 手动防御——功能上对了，但每个 controller 都要重复写。建议引入 `class-validator` + `ValidationPipe` 做统一入参校验，DTO 用装饰器声明 schema。此项工作量约 0.5 人日，可放下轮迭代。

### suggest-2 · 老 sandbox nickname 分支未清除

**文件**：`server/src/modules/room/room.service.ts:78-91, 175-227`

老 `joinRoom` 与 `joinSandboxRoom` 仍有"按 nickname 匹配已断线玩家 rejoin"逻辑。BE-8 断线保坐已改为按 userId 匹配，nickname 分支目前只对**匿名进 sandbox**有意义——但 v2 已决定 sandbox 也需登录（`§4.8`）。建议在 FE 完全切到登录后统一移除，减少代码分支。

### suggest-3 · Reconnect 定时器无上限

**文件**：`server/src/modules/room/reconnect.service.ts`

`pending: Map<userId, Timeout>` 若服务运行足够久 + 有恶意用户反复登录再断，可能积压很多待清理的计时器。虽然每次 `scheduleReclaim` 会覆盖同 userId 的旧 timeout，但**不同 userId 的堆积没有上限**。生产可加"最大 pending 数 = 1 万"的守卫。本期用户量小，非阻塞。

### suggest-4 · LobbyChatService.send 里随机采样淘汰有小概率漂移

**文件**：`server/src/modules/lobby-chat/lobby-chat.service.ts:70-71`

```ts
if (Math.random() < 0.1) void this.evictOldIfNeeded();
else void this.evictOldIfNeededSoft();
```

10% 概率做全扫，90% 走 soft 单条。**边界情况**：连续 90% soft 时若消息突然涌入，可能瞬时 count > 1000+9 才触发一次全扫。用户可见性极低（首拉只取 100，多余的存 SQLite 也无害），但违反了 R-8 "严格 1000 条"的判据。建议：**每次插入都调 soft，但 soft 直接删所有超出的（`LIMIT count-1000`）**，废掉全扫版本，逻辑更简单。

### suggest-5 · debug controller 拼 SQL 字符串

**文件**：`server/src/modules/debug/debug.controller.ts:31, 38`

```ts
expiresAt: () => `datetime(expiresAt, '-${seconds} seconds')`,
```

`seconds` 已被 `Math.max(0, Math.floor(Number(...)))` 消毒，数值化 100% 安全。但字符串拼 SQL 是**代码嗅觉**，建议改用 TypeORM `parameters`：`{ expiresAt: () => 'datetime(expiresAt, :off || \' seconds\')' }` + `parameters: { off: -seconds }`。此为 dev-only 端点，非阻塞。

### suggest-6 · Cookie tk_at Path=/ 可考虑收窄

Cookie `tk_at` 现在 `Path=/`，意味着所有请求都带上（含静态资源）。若前端有 CDN 或第三方 iframe 场景，会有隐私泄漏风险。建议 `Path=/api`，减小暴露面。本期 SPA + 单域名，非阻塞。

## 复审要点（reviewer 需重新跑）

修完 blocking 后请：

1. **blocking-1**：设 `NODE_ENV=production` 启动服务，无 `JWT_ACCESS_SECRET` 应立即崩溃；有则正常
2. **blocking-2**：连两个 tab 同账号，tab2 登录后 tab1 断线，5min 内 tab1 重连——应能拿回座位（当前实现会失败）
3. **blocking-3**：`SANDBOX_ENABLED=false` 时 client 用 `emit('sandbox:xxx', payload, ack)`，ack 应立即回 `{ok:false,code:'E_SANDBOX_DISABLED'}` 而非 hang
4. 上述 3 项修完后跑一遍 `qa/be-smoke-report.v1.md` 的完整批 1-4 用例，保证无回归

## 建议 lifecycle

```yaml
suggestion:
  from: backend-code-reviewer
  to: lifecycle-orchestrator
  verdict: changes-requested
  target_agent: backend-coder
```

修完 blocking → 触发 v2 review → 全 pass 后签"③后"。
