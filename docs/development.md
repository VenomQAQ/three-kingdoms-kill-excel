# 开发说明

## 仓库

- GitHub: <https://github.com/VenomQAQ/three-kingdoms-kill-excel>

## Monorepo 工作区

| 包 | 路径 | 说明 |
|----|------|------|
| `@tk/shared` | `packages/shared` | Room、Socket 事件、常量；修改后需 `npm run build -w @tk/shared` |
| `server` | `server` | NestJS，默认端口 `3000` |
| `client` | `client` | Vite，默认端口 `5173`，代理 `/socket.io` 与 `/rooms` |

## 环境变量

| 变量 | 位置 | 默认 |
|------|------|------|
| `VITE_SOCKET_URL` | `client/.env` | 空（同源，走 Vite 代理） |
| `CORS_ORIGIN` | `server` | `http://localhost:5173` |

## 主要 API

### REST

- `GET /rooms` — 公开房间列表（含状态、人数、房主）
- `GET /rooms/:code` — 查询单个房间是否存在

### WebSocket（Socket.IO）

| 事件 | 方向 | 说明 |
|------|------|------|
| `room:create` | C→S | 创建房间 |
| `room:join` | C→S | 加入（`70755712` 走测试房逻辑） |
| `room:leave` | C→S | 离开 |
| `room:ready` | C→S | 准备 |
| `room:start` | C→S | 开局 |
| `sandbox:addPlayer` | C→S | 测试房添加虚拟角色 |
| `sandbox:switchActor` | C→S | 切换本连接操控的角色 |
| `sandbox:start` | C→S | 测试房模拟开局 |
| `sandbox:playCard` | C→S | 出牌（不自动结束回合） |
| `sandbox:endTurn` | C→S | 结束出牌阶段 |
| `room:state` | S→C | 房间状态广播 |
| `chat:message` | S→C | 聊天消息 |

## 前端组件（WPS）

| 组件 | 文件 | 说明 |
|------|------|------|
| `TitleBar` | `client/src/components/wps/TitleBar.tsx` | 顶栏文件名、搜索、共享 |
| `Ribbon` | `Ribbon.tsx` | 选项卡 +「开始」游戏按钮 |
| `PlayControlBar` | `PlayControlBar.tsx` | 对局出牌条（仅测试中显示） |
| `RoomListGrid` | `RoomListGrid.tsx` | 房间列表 Sheet |
| `LobbyGrid` | `LobbyGrid.tsx` | 房间内等待大厅 |
| `BattleGrid` | `BattleGrid.tsx` | 对局战场表格 |
| `GameGrid` | `GameGrid.tsx` | 按 `room.status` 切换 Lobby/Battle |

## 测试房常量

- 房间号：`70755712`（`SANDBOX_ROOM_CODE`，定义于 `packages/shared` 与 `client/src/data/decoy.ts`）
- 服务端启动时 `RoomService.ensureSandboxRoom()` 自动创建空壳房间

## 本地调试建议

1. 开两个浏览器窗口可测多人房间；测试房可用 **切换角色** 单窗口多控。
2. 修改 `@tk/shared` 后执行根目录 `npm run build` 再重启 dev。
3. 老板键 `Ctrl+Shift+H` 用于快速检查假表伪装效果。

## 里程碑

- **M1（当前）**：WPS 壳、房间、聊天、房间列表、测试房回合模拟
- **M2**：YAML 卡牌配置 + 规则引擎 + 完整身份局流程
