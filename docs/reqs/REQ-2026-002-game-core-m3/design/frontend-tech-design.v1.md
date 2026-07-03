# 前端技术方案 · REQ-2026-002 · v1

- **作者**：frontend-design
- **时间**：2026-07-03
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 落点

```
client/src/
├── components/wps/
│   ├── LobbyGrid.tsx          ← 正式房等待大厅表格
│   ├── GameGrid.tsx           ← waiting → LobbyGrid；playing → BattleGrid
│   └── Ribbon.tsx             ← 「准备」「开始」按钮（经 App ribbonActions）
├── store/
│   └── appStore.ts            ← toggleReady / applyRoomState / auth:hello.playerId
└── App.tsx                    ← handleRibbonAction('ready')、onToggleReady 透传
```

## 2. 正式房等待大厅交互

| 入口 | 行为 | 禁用条件 |
|------|------|----------|
| Ribbon「准备」 | `toggleReady()` → `room:ready` | 未在房间 / 对局中 / 测试房 |
| 公式栏 `/ready` | 同上 | 未登录（正式房需登录） |
| LobbyGrid E 列 | 单击本人行「准备」单元格 | 仅本人行；`linkCell` 样式提示可点 |

`LobbyGrid` 数据行从第 4 行起（`pIdx = rowNum - 4`），本人行加 `myRow` 背景。

## 3. playerId 对齐（R-FR-04 / R-FR-05）

断线重连后服务端 `rebindUserPlayer` 会迁移座位 `player.id`，客户端须同步：

1. **`applyRoomState(room, prev)`**（`appStore.ts`）
   - `room:created` / `room:joined` / `room:state` 统一经过
   - 若本地 `playerId` 不在 `room.players`，按 `nickname` 匹配非虚拟玩家回写
   - `actingPlayerId` 失效时回退为 `playerId`

2. **`auth:hello.playerId`**
   - socket 连接后服务端下发当前绑定 id
   - 客户端写入 `playerId` / `actingPlayerId`

3. **`toggleReady`**
   - 不再因 `!playerId` 提前 return
   - 查找本人：`playerId` 匹配 → 昵称回退 → `socket.emit('room:ready', { ready: !me?.ready })`

## 4. 与测试房隔离

- `isSandbox` 时 Ribbon「准备」`disabled: true`
- `LobbyGrid` 第 3 行提示文案区分：测试房「添加角色后模拟开局」/ 正式房「全员准备后房主点击开始」
- 正式房 `toggleReady` / `startGame` 走 `room:*`；测试房走 `sandbox:*`（`routeGameEmit`）

## 5. 验收映射

| AC | 实现要点 |
|----|----------|
| AC-FR-01 | Ribbon + E 列单击 + `/ready` 三入口 |
| AC-FR-02 | 正式房 `isSandbox=false`，`toggleReady` 不读 `actingPlayerId` |
| AC-FR-03 | `applyRoomState` + `auth:hello.playerId` |
