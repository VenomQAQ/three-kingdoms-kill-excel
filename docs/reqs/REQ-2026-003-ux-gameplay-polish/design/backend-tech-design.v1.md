# 后端技术方案 · REQ-2026-003 · v1

- **作者**：backend-design
- **时间**：2026-07-03T18:40+08:00
- **消费 PRD**：[prd.v2.md](../prd/prd.v2.md)
- **契约参考**：[api-contract.v1.md](./api-contract.v1.md)

## 1. 落点

```
server/src/
├── gateway/game.gateway.ts          ← room:join 复用、general:select、nickname 广播
├── modules/room/room.service.ts     ← selecting 状态机、保坐重绑、正式房选将
├── modules/game/game.service.ts     ← 选将完成后创建/启动正式房 engine
├── modules/auth/auth.service.ts     ← 注册确认密码校验、改昵称
└── modules/chat / lobby-chat        ← 昵称展示同步
packages/engine/src/resolution/      ← 无懈 pass 后继续主体结算
packages/shared/src/index.ts         ← RoomStatus / 选将 payload / 错误码类型
```

## 2. 房间重进：复用 `room:join`

`RoomService.joinRoom(userId, code, socketPlayerId)` 按顺序处理：

1. 房间不存在 → `E_ROOM_NOT_FOUND`。
2. 当前 userId 已在该房间玩家列表中 → 更新 socket/playerId 绑定，回传 `room:state`，不新增座位。
3. 命中 reconnectGraceSec 内保留座位 → 取消 reclaim，迁移座位、hostId、engine playerId 绑定，回传 `room:state`。
4. 房间 `status` 为 `selecting`/`playing` 且不是成员 → `E_ROOM_STARTED`。
5. 正常首次加入 → 校验版本与容量后新增座位。

日志：`room.join.first`、`room.join.return`、`room.join.rebind`。

## 3. 正式房选将状态机

正式房 `room:start` 改为：

```
waiting + 房主 + 人数/ready 校验
  → 分配身份（主公公开）
  → room.status = 'selecting'
  → buildSelectionPromptFor(currentPlayer = 主公)
  → broadcast room:state
```

每轮选将：

- 主公候选数 5，其他角色候选数 3。
- 候选从剩余武将池抽取，不包含已选武将。
- 候选 payload 包含 `id/name/maxHp/skills[]`。
- 为当前玩家启动计时器，默认 `SELECTING_TIMEOUT_SEC=180`。
- `general:select` 或超时后确认武将，推进到下一座次。
- 全员完成后设置体力/主公 +1、发 4 张起始手牌、创建/启动正式房 engine、`room.status='playing'`。

并发控制：房间级同步锁或队列；只接受当前 `currentPlayerId` 的 `general:select`。

## 4. 测试房隔离

- sandbox 继续走现有 `sandbox:addPlayer` / 自定义角色/武将 / 模拟开局路径。
- 不把 sandbox 默认纳入正式房 `selecting` 状态机。
- 正式房改造不得删除或改变手动指定武将能力。
- sandbox 仍可复用引擎修复（锦囊/无懈），用于规则回归。

## 5. 昵称、日志、注册

- 注册接口增加 `confirmPassword` 校验；不一致返回 `E_PASSWORD_MISMATCH`，不创建账号。
- 新增/扩展改昵称 API 或 socket action：校验 2–12 字、非空白、无 `<>`、1 次/分钟；成功后更新 DB、房间内存态并广播 `user:nicknameChanged`。
- 房间列表、聊天、大厅表格、状态栏等 payload 使用 nickname。
- 对局动作日志由服务端生成 `text`，主体优先 `actorGeneralName`；邮箱不得进入日志文本。

## 6. 无懈断链修复

修复点：`submitWuxieResponse(pass)` 在无懈队列耗尽后必须继续原锦囊主体结算。

- `continueResolution` 返回的调度信号（如 AOE TargetQueue）必须被上层 gateway/game service 消费。
- 覆盖南蛮、万箭、决斗、借刀、五谷、过河/顺手、延时锦囊 7 类清单。
- 对无懈完全抵消的锦囊，只写日志并结束，不进入主体结算。

## 7. 配置与可观测

| 配置 | 默认 | 说明 |
|---|---|---|
| `SELECTING_TIMEOUT_SEC` | `180` | 正式房选将超时；测试环境可设 5 |
| `RECONNECT_GRACE_SEC` | `300` | 保坐期，沿用 REQ-001 |

日志：

- `room.join.return` / `room.join.rebind`
- `room.selecting.started` / `room.general.selected` / `room.general.timeout`
- `user.nickname.changed`
- `trick.wuxie.continue_resolution`

## 8. 验收映射

| AC | 后端要点 |
|---|---|
| AC-UX-01~04 | `room:join` rebind + `room:state` 恢复等待/选将/对局 |
| AC-GAME-01~03 | selecting 状态机、候选数、候选信息、180s 超时 index=0 |
| AC-SBX-01 | sandbox 自定义角色路径不变 |
| AC-ACCT-01~04 | nickname payload + 日志 generalName + 注册确认密码 |
| AC-ENG-01~03 | 无懈队列结束后继续主体结算 |
