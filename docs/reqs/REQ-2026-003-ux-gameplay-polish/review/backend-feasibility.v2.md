# 后端可行性复核 · REQ-2026-003 · v2

- **评审员**：backend-feasibility
- **时间**：2026-07-03T18:20+08:00
- **判定**：**pass**
- **消费 PRD**：[prd/prd.v2.md](../prd/prd.v2.md)
- **v1 参考**：[backend-feasibility.v1.md](./backend-feasibility.v1.md)

## 1. v1 条件复核

| v1 条件 | v2 决议 | 是否消解 | 备注 |
|---|---|---|---|
| sandbox 是否走选将阶段 | 测试房保留原逻辑，不强制正式房选将 | 是 | 避免拖慢规则/引擎测试 |
| `room:rejoin` 与 `room:join` 策略 | 重进/刷新/保坐重绑统一复用 `room:join` | 是 | 减少 gateway 事件分支 |
| 选将超时默认第一张 | 正式房 180s 超时，默认候选数组 `index=0` | 是 | 服务端候选顺序需在当前 prompt 内稳定 |

## 2. 新增/修订项影响

| 项 | 后端影响 | 结论 |
|---|---|---|
| `room.status='selecting'` | `RoomStatus` 增 selecting；正式房 `startGame` 分配身份后进入 selecting，不立即 `engine.start()` | 可行 |
| `room:join` 保坐重绑 | 同 userId + room code 命中保坐/原座位时 rebind socket 与 playerId，不新增玩家 | 可行 |
| 候选武将 payload | 服务端下发 id、名称、技能摘要、体力/血量、剩余时间 | 可行 |
| 180s 选将计时 | 房间级当前选将计时器；超时选当前候选 `index=0` | 可行 |
| 测试房保留 | sandbox 继续支持自定义角色/武将与快速模拟开局；正式房状态机改造不得复用破坏该路径 | 可行 |
| 对局日志武将名 | 日志事件在有武将上下文时提供 generalName；账号邮箱不进入日志 | 可行 |
| 无懈断链 | `submitWuxieResponse(pass)` 队列空后继续主体结算，修复 scheduleAoe/continueResolution 回传链 | 可行 |

## 3. 成本 & 风险

- 更新后粗估：**6–9 人日**，与 v1 基本一致。
- 主要风险仍是正式房 `startGame` 拆阶段与引擎创建时机；v2 明确测试房保留原逻辑，降低 sandbox 回归风险。
- `room:join` 复用要求 join 内部区分首次加入、保坐重绑、已在房内返回三种情形，需单测覆盖。

## 4. 判定

**pass**：v1 后端条件已由 PRD v2 消解；正式房选将、180s 超时、测试房保留、日志展示均可在现有 RoomService/GameService/engine 边界内实现。可进入 design。
