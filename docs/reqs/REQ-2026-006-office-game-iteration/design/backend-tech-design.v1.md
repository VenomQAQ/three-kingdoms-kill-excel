# 后端技术设计 v1

## 1. 共享模型

- `GameType` 加入 `@tk/shared`。
- `Room` 增加 `gameType` 与可选 `monopoly`。
- `RoomListItem` 增加 `gameType/gameName`。
- `PlayerPublicProfile` 增加 `statsByGame`，保留 `stats`。

## 2. 房间服务

- `createRoom` 接收 `gameType`，默认三国杀。
- 大富翁房间 `maxPlayers=4`，`versionName='大富翁中国之旅'`。
- `startGame` 根据 `room.gameType` 分发：三国杀走原逻辑，大富翁初始化棋盘状态。
- `listPublicRooms` 支持 `gameType` 过滤，三国杀才套用 `versionId` 过滤。

## 3. 大富翁服务内聚

首期将大富翁基础逻辑放在 `RoomService` 私有方法中，避免过早拆复杂引擎：
- 初始化世界城市棋盘。
- 掷骰、移动、经过起点奖励。
- 空地购买、已购地过路费、回合切换。
- 资产不足时仅记录日志，不做淘汰闭环。

## 4. 资料与连连看

- 公开资料返回三类游戏统计。历史数据为 0 值；`stats` 指向三国杀。
- 连连看只改配置，不改结算接口。

