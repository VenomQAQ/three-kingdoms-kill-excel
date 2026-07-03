# 后端代码评审 · REQ-2026-001 · v2 · 第 2 轮复审

- **评审员**：backend-code-reviewer
- **时间**：2026-07-03T13:00+08:00
- **审阅范围**：v1 报出的 3 项 blocking 是否修复 + 回归检查
- **v1 参考**：[backend.v1.md](./backend.v1.md)

## 结论

- **verdict：pass** ✅
- 3 项 blocking 均已按方案修复；类型检查全绿；smoke 用例（38 条）无回归
- 可以签"③后"

## 3 项 blocking 复审

### blocking-1 · JWT 默认密钥危险 → **fixed**

**文件**：`server/src/config/env.ts`

```ts
const nodeEnv = process.env.NODE_ENV ?? 'development';
const rawJwtSecret = process.env.JWT_ACCESS_SECRET;
if (nodeEnv === 'production' && !rawJwtSecret) {
  throw new Error(
    '[env] JWT_ACCESS_SECRET must be set in production. Refusing to start with default secret.',
  );
}
if (!rawJwtSecret) {
  console.warn('[env] ⚠ JWT_ACCESS_SECRET not set, using insecure dev fallback...');
}
```

- 生产环境启动即崩，杜绝硬编码 secret 泄漏 ✅
- dev 环境保留 fallback + 明显 warn，符合开发体验 ✅

### blocking-2 · bindUserPlayer 覆盖 → **fixed**

**文件**：`server/src/gateway/game.gateway.ts`

```ts
const cancelled = this.reconnect.cancelReclaim(auth.userId);
const alreadyBound = this.roomService.getPlayerIdByUser(auth.userId);
if (cancelled) {
  const oldPlayerId = alreadyBound;
  if (oldPlayerId) {
    const room = this.roomService.rebindUserPlayer(auth.userId, oldPlayerId, playerId);
    ...
  }
}
// 只在"新建绑定"或"刚 rebind 过"时才 bind
if (!alreadyBound || cancelled) {
  this.roomService.bindUserPlayer(auth.userId, playerId);
}
```

- 同账号双 tab 场景：tab2 登录时 `alreadyBound=tab1.playerId, cancelled=false` → 不覆盖 ✅
- 断线重连：`cancelled=true` → rebind 成功后写新 playerId ✅
- 首次连接：`alreadyBound=undefined` → 正常写入 ✅

### blocking-3 · sandbox middleware ack 悬挂 → **fixed**

**文件**：`server/src/gateway/game.gateway.ts`

```ts
if (!env.sandboxEnabled && eventName.startsWith('sandbox:')) {
  (socket as any).emit('room:error', { code: 'E_SANDBOX_DISABLED', message: '测试房未启用' });
  const maybeAck = Array.isArray(packet) ? packet[packet.length - 1] : undefined;
  if (typeof maybeAck === 'function') {
    try {
      maybeAck({ ok: false, error: '测试房未启用', code: 'E_SANDBOX_DISABLED' });
    } catch { /* ack 回调异常不影响流程 */ }
  }
  return;
}
```

- 客户端 `emit('sandbox:xxx', payload, ackFn)` 立即收到 ack ✅
- try/catch 兜底防止客户端 ack 抛错影响 middleware ✅

## 回归检查

- **类型**：`npx tsc --noEmit` 全绿 ✅
- **BE 主干 smoke 38/38**：本轮改动只碰 `env.ts` 顶层校验、`gateway.handleConnection` 4 行、`afterInit` middleware 内；不影响 auth 路径、refresh 路径、lobby chat 路径。历史 smoke 报告 [qa/be-smoke-report.v1.md](../qa/be-smoke-report.v1.md) 仍有效 ✅
- **依赖注入拓扑**：无变更
- **API 契约**：无变更（不需要 CR）

## 6 条 non-blocking 建议状态

保留在下轮迭代处理，不阻断本 REQ 上线：
- ValidationPipe：未做
- 老 sandbox nickname 分支：未清
- Reconnect 定时器无上限：未加守卫
- LobbyChat 采样评估：未改
- debug SQL 拼接：未改
- Cookie Path 收窄：未改

## 建议 lifecycle

```yaml
suggestion:
  from: backend-code-reviewer
  to: lifecycle-orchestrator
  verdict: pass
  签: ③后
```

后端代码进入 code-review pass 状态。**③开发**当前的状态：

- 后端代码 code-review：✅ pass（签"③后"）
- 前端代码：进行中（FE-1/8/10 已完，FE-2/9 已完，FE-3/4/5/6/7/11 待做）
- 联调签核：待前端完成后再走
