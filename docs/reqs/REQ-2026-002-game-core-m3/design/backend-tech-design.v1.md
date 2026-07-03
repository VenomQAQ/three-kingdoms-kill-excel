# 后端技术方案 · REQ-2026-002 · v1

- **作者**：backend-design
- **时间**：2026-07-03
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 落点

```
server/src/
├── gateway/
│   └── game.gateway.ts        ← room:ready / room:start / game:* ；auth:hello.playerId
└── modules/
    └── room/
        └── room.service.ts    ← setReady / startGame / rebindUserPlayer / 身份分配
packages/engine/               ← M3 锦囊与装备规则（五谷/借刀/AOE/八卦阵/木牛）
```

## 2. 正式房等待大厅 API

| 事件 | 处理 | 校验 |
|------|------|------|
| `room:ready` | `RoomService.setReady(playerId, ready)` → `broadcastRoomState` | 玩家须在房间内 |
| `room:start` | `RoomService.startGame(playerId)` → 身份分配 → `game:started` | 房主、≥2 人、全员 ready、status=waiting |

`getPlayerId(client)` 取自 socket 当前 id；与 `userPlayer[userId]` 在重连 rebind 后一致。

## 3. 断线重连与 playerId（R-FR-05）

`handleConnection` 流程（BE-8，沿用 REQ-2026-001）：

1. 新 socket 分配 `playerId`
2. 已认证且命中 `reconnect.cancelReclaim` → `rebindUserPlayer(userId, oldId, newId)`
3. `room.players[].id` 迁移为新 id；`hostId` / 引擎内 id 同步
4. `auth:hello` 下发 `playerId: getPlayerIdByUser(userId) ?? playerId`

客户端据此与 `room:state` 昵称回退对齐，避免准备操作报 `NOT_IN_ROOM`。

## 4. M3 引擎扩展（摘要）

| 需求 | 实现位置 |
|------|----------|
| 五谷丰登 | `card-play-service.ts` · `pick_revealed` 亮牌按座次选取 |
| 借刀杀人 | `card-play-service.ts` · 持刀者出杀或失去武器 |
| AOE 顺序结算 | `TargetQueue` + 锦囊先消耗 |
| 八卦阵 | `equipment-zone.ts` · 判定红色当闪 |
| 木牛流马 | `equipment.ts` · 宝物槽 |

## 5. 正式房对局 Gateway（进行中）

`game:*` 事件经 `dispatchFormalGame` 转发至 `RoomService.game*`，与 sandbox 共用 `SangokushiEngine`，按 `playerId` 过滤下发状态。

## 6. 验收映射

| AC | 服务端要点 |
|----|------------|
| AC-FR-01 | `setReady` 广播 `room:state` |
| AC-FR-02 | 正式房 `isSandbox=false`，`startGame` 不走 sandbox |
| AC-FR-03 | `auth:hello.playerId` + `rebindUserPlayer` |
| AC-M3-01~04 | 引擎单测 + 手工 TR/AOE 用例 |
