# API 契约 · REQ-2026-005 · v1

- **状态**：frozen-for-implementation
- **时间**：2026-07-05
- **依据**：[PRD v2](../prd/prd.v2.md)

## 1. Shared Types

### 1.1 RoomPlayer 增量

```ts
interface RoomPlayer {
  id: string;
  userId?: string;
  nickname: string;
  // existing fields...
}
```

- 正式登录玩家必须下发 `userId`。
- 虚拟角色不下发 `userId`。
- 客户端点击虚拟角色时显示虚拟空态，不请求用户资料接口。

### 1.2 PlayerPublicProfile

```ts
interface PlayerPublicProfile {
  userId: string;
  nickname: string;
  level: number;
  coins: number;
  stats: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  updatedAt: number;
  _v: 1;
}
```

### 1.3 LianliankanConfig

```ts
type LianliankanDisplayMode = 'emoji' | 'text';
type LianliankanDifficultyId = 'easy' | 'normal' | 'hard';
type LianliankanSessionStatus = 'playing' | 'won' | 'lost' | 'expired';

interface LianliankanThemeItem {
  id: string;
  text: string;
  emoji: string;
  similarGroup?: string;
}

interface LianliankanTheme {
  themeId: string;
  name: string;
  items: LianliankanThemeItem[];
  similarGroups: Array<{ groupId: string; itemIds: string[] }>;
}

interface LianliankanDifficulty {
  difficultyId: LianliankanDifficultyId;
  name: string;
  rows: number;
  cols: number;
  kindCount: number;
  timeLimitSec: number;
  entryFee: number;
  rewardCoins: number;
  similarGroupWeight: number;
}

interface LianliankanConfig {
  themes: LianliankanTheme[];
  difficulties: LianliankanDifficulty[];
  defaultThemeId: string;
  defaultDifficultyId: LianliankanDifficultyId;
  _v: 1;
}
```

### 1.4 LianliankanSession

```ts
interface LianliankanTile {
  tileId: string;
  itemId: string;
  row: number;
  col: number;
}

interface LianliankanSession {
  sessionId: string;
  mode: 'solo' | 'race';
  roomId?: string;
  themeId: string;
  difficultyId: LianliankanDifficultyId;
  status: LianliankanSessionStatus;
  rows: number;
  cols: number;
  timeLimitSec: number;
  entryFee: number;
  rewardCoins: number;
  startedAt: number;
  deadlineAt: number;
  finishedAt?: number;
  board: LianliankanTile[];
  _v: 1;
}
```

---

## 2. HTTP API

### 2.1 获取公开玩家资料

`GET /api/users/:userId/profile`

响应 200：`PlayerPublicProfile`

错误：

| code | HTTP | 说明 |
|---|---:|---|
| E_USER_NOT_FOUND | 404 | 用户不存在 |

### 2.2 获取连连看配置

`GET /api/lianliankan/config`

响应 200：`LianliankanConfig`

### 2.3 创建连连看局

`POST /api/lianliankan/sessions`

请求：

```json
{
  "themeId": "fruits",
  "difficultyId": "easy",
  "mode": "solo",
  "_v": 1
}
```

响应 201：

```json
{
  "session": { "sessionId": "llk_xxx", "status": "playing", "_v": 1 },
  "wallet": { "coins": 95, "experience": 0, "level": 1 },
  "_v": 1
}
```

错误：

| code | HTTP | 说明 |
|---|---:|---|
| E_UNAUTHORIZED | 401 | 未登录 |
| E_WALLET_INSUFFICIENT_COINS | 400 | 金币不足 |
| E_LLK_INVALID_CONFIG | 400 | 主题或难度不存在 |

### 2.4 结算连连看局

`POST /api/lianliankan/sessions/:sessionId/finish`

请求：

```json
{
  "result": "won",
  "clientFinishedAt": 1783267200000,
  "remainingTiles": 0,
  "_v": 1
}
```

响应 200：

```json
{
  "sessionId": "llk_xxx",
  "status": "won",
  "rewardCoins": 8,
  "wallet": { "coins": 103, "experience": 0, "level": 1 },
  "alreadySettled": false,
  "_v": 1
}
```

幂等响应：若 session 已结算，返回当前结算结果，`alreadySettled: true`，不重复派奖。

错误：

| code | HTTP | 说明 |
|---|---:|---|
| E_UNAUTHORIZED | 401 | 未登录 |
| E_LLK_SESSION_NOT_FOUND | 404 | session 不存在或不属于当前用户 |
| E_LLK_SESSION_EXPIRED | 400 | 超时提交胜利 |

---

## 3. Socket Events

沿用已有：

```ts
'user:walletChanged': (payload: {
  coins: number;
  experience: number;
  level: number;
  reason?: string;
  _v: 1;
}) => void;
```

连连看开局扣费和胜利奖励后均广播该事件到当前用户 socket。

---

## 4. Error Codes

| code | 文案建议 |
|---|---|
| E_WALLET_INSUFFICIENT_COINS | 金币不足，无法开始本局 |
| E_LLK_SESSION_NOT_FOUND | 本局已失效 |
| E_LLK_SESSION_SETTLED | 本局已结算 |
| E_LLK_SESSION_EXPIRED | 已超时，挑战失败 |
| E_LLK_INVALID_CONFIG | 连连看配置不存在 |
| E_USER_NOT_FOUND | 玩家不存在 |

