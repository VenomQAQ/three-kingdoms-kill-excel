# 开发说明

## 仓库

- GitHub: <https://github.com/VenomQAQ/three-kingdoms-kill-excel>

## Monorepo 工作区

| 包 | 路径 | 说明 |
|----|------|------|
| `@tk/shared` | `packages/shared` | Room、Socket 事件、Prompt 类型、常量 |
| `@tk/engine` | `packages/engine` | `SangokushiEngine` 配置驱动规则引擎 |
| `server` | `server` | NestJS，默认端口 `3000` |
| `client` | `client` | Vite，默认端口 `5173`，代理 `/socket.io` 与 `/rooms` |

修改 `@tk/shared` 或 `@tk/engine` 后需执行根目录 `npm run build` 再重启 dev。

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

#### 房间与聊天

| 事件 | 方向 | 说明 |
|------|------|------|
| `room:create` | C→S | 创建房间 |
| `room:join` | C→S | 加入（`70755712` 走测试房逻辑） |
| `room:leave` | C→S | 离开 |
| `room:ready` | C→S | 准备 |
| `room:start` | C→S | 开局 |
| `room:state` | S→C | 房间状态广播 |
| `room:error` | S→C | 操作失败（含引擎异常信息） |
| `chat:send` | C→S | 发送聊天 |
| `chat:message` | S→C | 聊天消息 |
| `chat:history` | C→S | 拉取历史（ack 回调） |
| `game:started` | S→C | 对局开始通知 |

#### 模拟测试房（Sandbox）

| 事件 | 方向 | 说明 |
|------|------|------|
| `sandbox:addPlayer` | C→S | 添加虚拟角色（可带 `general` 武将名） |
| `sandbox:removePlayer` | C→S | 移除虚拟角色 |
| `sandbox:switchActor` | C→S | 切换本连接操控的角色 |
| `sandbox:actor` | S→C | 确认当前操控角色 id |
| `sandbox:start` | C→S | 模拟开局（创建 `SangokushiEngine` 并发牌） |
| `sandbox:playCard` | C→S | 出牌 `{ card, handIndex? }` |
| `sandbox:confirmPlay` | C→S | 确认/取消出牌 `{ promptId, choiceId }` |
| `sandbox:selectTargets` | C→S | 选目标 `{ promptId, targetIds[] }` |
| `sandbox:submitResponse` | C→S | 响应杀/闪等 `{ promptId, choiceId }` |
| `sandbox:selectZoneCard` | C→S | 过河拆桥/顺手牵羊选区域牌 `{ promptId, choiceId }` |
| `sandbox:useSkill` | C→S | 发动技能 `{ skillId }` |
| `sandbox:rendeGive` | C→S | 仁德给牌 |
| `sandbox:rendeFinish` | C→S | 结束仁德 |
| `sandbox:zhihengConfirm` | C→S | 制衡弃牌 `{ handIndices[] }` |
| `sandbox:modifyJudge` | C→S | 鬼才改判 |
| `sandbox:skipModifyJudge` | C→S | 不改判 |
| `sandbox:discardCards` | C→S | 弃牌阶段 `{ promptId, handIndices[] }` |
| `sandbox:endTurn` | C→S | 结束出牌阶段 |
| `sandbox:addCard` | C→S | 调试：给某角色加手牌 |

## 服务端模块

| 模块 | 文件 | 说明 |
|------|------|------|
| `GameGateway` | `server/src/gateway/game.gateway.ts` | WebSocket 入口，转发 sandbox 事件 |
| `RoomService` | `server/src/modules/room/room.service.ts` | 房间生命周期、测试房、断线重连 |
| `GameService` | `server/src/modules/game/game.service.ts` | 引擎实例管理、`syncRoomFromEngine` |

## 前端组件（WPS）

| 组件 | 文件 | 说明 |
|------|------|------|
| `TitleBar` | `client/src/components/wps/TitleBar.tsx` | 顶栏文件名、搜索、共享 |
| `Ribbon` | `Ribbon.tsx` | 选项卡 +「开始」游戏按钮 |
| `PlayControlBar` | `PlayControlBar.tsx` | 对局出牌条（手牌、出牌阶段技能、结束回合） |
| `GamePromptModal` | `GamePromptModal.tsx` | 引擎 `prompt` 弹窗（确认出牌/选目标/响应/无懈/选区域牌/弃牌/改判/技能） |
| `CharacterSkillModal` | `CharacterSkillModal.tsx` | 查看角色技能、装备区、判定区说明 |
| `CardDetailModal` | `CardDetailModal.tsx` | 查看装备牌说明 |
| `RoomListGrid` | `RoomListGrid.tsx` | 房间列表 Sheet |
| `BattleGrid` | `BattleGrid.tsx` | 对局战场表格，右侧含操作区日志与聊天区 |
| `GameGrid` | `GameGrid.tsx` | 按 `room.status` 切换 Lobby/Battle |

## 测试房常量

- 房间号：`70755712`（`SANDBOX_ROOM_CODE`，定义于 `packages/shared` 与 `client/src/data/decoy.ts`）
- 服务端启动时 `RoomService.ensureSandboxRoom()` 自动创建空壳房间
- 断线重连：按昵称匹配非虚拟、已断线的玩家，迁移 socket id 与引擎内 player id

## 前端状态与显示约定

- `client/src/utils/display.ts` 统一处理“界”前缀剥离、日志/Prompt 文案净化、房间数据展示态清洗
- `appStore.connect()` 会复用已有 socket 实例，避免重复创建连接
- `room:created`、`room:joined`、`room:state` 均先经过 `sanitizeRoom()` 再进入前端状态

## 本地调试建议

1. 开两个浏览器窗口可测多人房间；测试房可用 **切换角色** 单窗口多控。
2. 修改 `@tk/shared` / `@tk/engine` 后执行根目录 `npm run build` 再重启 dev。
3. 老板键 `Ctrl+Shift+H` 用于快速检查假表伪装效果。
4. 对局中公式栏可直接输入牌名 Enter 出牌；若输入内容不匹配当前操控角色手牌，则按聊天消息发送。
5. 战场表格中点击装备名称可查看卡牌说明，点击“技能”列可查看角色技能。

## 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M1 | WPS 壳、房间、聊天、房间列表、测试房 UI | ✅ |
| M2 | `@tk/engine` 配置驱动引擎、测试房完整交互 | ✅ |
| M3 | 标准锦囊全套 + 装备 + AOE TargetQueue | 🚧 |
| M4 | 界限突破 30 将技能接线 | 🚧 |
| M5 | 正式房间对局、断线重连、观战 | 🔲 |
