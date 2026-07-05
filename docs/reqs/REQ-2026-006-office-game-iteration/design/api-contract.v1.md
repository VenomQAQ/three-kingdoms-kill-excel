# API 契约 v1

## 1. 共享类型

### 1.1 GameType

```ts
type GameType = 'sanguosha' | 'monopoly';
```

### 1.2 PlayerPublicProfile

保留旧字段 `stats`，新增 `statsByGame`：

```ts
interface GameStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface PlayerPublicProfile {
  userId: string;
  nickname: string;
  level: number;
  coins: number;
  stats: GameStats;
  statsByGame: {
    sanguosha: GameStats;
    lianliankan: GameStats;
    monopoly: GameStats;
  };
  updatedAt: number;
  _v: 1;
}
```

### 1.3 Room / RoomListItem

```ts
interface Room {
  gameType?: GameType;
  monopoly?: MonopolyGameState;
}

interface RoomListItem {
  gameType?: GameType;
  gameName?: string;
}
```

### 1.4 MonopolyGameState

```ts
interface MonopolyGameState {
  phase: 'lobby' | 'playing' | 'finished';
  turnIndex: number;
  round: number;
  lastDice?: [number, number];
  board: MonopolyBoardCell[];
  players: MonopolyPlayerState[];
  log: string[];
  pendingAction?: 'buy_or_skip' | null;
}
```

## 2. Socket 契约

### 2.1 `room:create`

请求扩展：

```ts
{
  nickname: string;
  versionId?: string;
  gameType?: 'sanguosha' | 'monopoly';
}
```

默认 `gameType='sanguosha'`。大富翁创建免费，不扣金币。

### 2.2 `room:list`

请求扩展：

```ts
{
  versionId?: string;
  gameType?: 'sanguosha' | 'monopoly' | 'all';
}
```

默认兼容旧行为：未传 `gameType` 时返回全部类型；传 `sanguosha` 时可叠加 `versionId` 过滤。

### 2.3 `monopoly:roll`

当前回合玩家掷骰并移动。服务端广播 `room:state`。

### 2.4 `monopoly:buy`

购买当前位置空地。余额不足或不可购买返回 `room:error`。

### 2.5 `monopoly:skip`

跳过购买并进入下一玩家回合。

## 3. HTTP 契约

### 3.1 `GET /api/users/:userId/profile`

响应 `PlayerPublicProfile`，新增 `statsByGame`，旧 `stats` 指向三国杀统计。

### 3.2 `GET /api/lianliankan/config`

返回更新后的难度与主题配置：简单 8x8、普通 10x10、困难 12x12，新增颜文字与 emoji 主题。

