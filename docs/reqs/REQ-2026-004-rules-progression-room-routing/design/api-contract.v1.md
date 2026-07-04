# API / 事件契约 · REQ-2026-004 · v1 [SSOT]

- **状态**：`version: v1`，`frozen: false`
- **作者**：backend-design
- **时间**：2026-07-04T13:20+08:00
- **消费 PRD**：[prd.v1.md](../prd/prd.v1.md)
- **前置契约**：[REQ-2026-001 api-contract.v1](../../REQ-2026-001-wps-account-version/design/api-contract.v1.md)、[REQ-2026-003 api-contract.v1](../../REQ-2026-003-ux-gameplay-polish/design/api-contract.v1.md)

## 0. 总则

- 本契约只定义 REQ-2026-004 的增量与覆盖项。
- 版本口径固定为 `standard-2014 = 2-8 人`。
- 成长经济 `R-PROG-*` 不进入本次设计开发契约，仅保留文档占位。

## 1. 房间与版本

### 1.1 `RoomStatus`

```ts
type RoomStatus = 'waiting' | 'selecting' | 'playing' | 'finished';
```

- `waiting`：可复用待命态，支持加入、准备、开始。
- `selecting`：正式房选将态。
- `playing`：对局进行态。
- `finished`：结算过渡态，仅短暂存在，随后必须回到 `waiting`。

### 1.2 `RoomBrief`

```ts
type RoomBrief = {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number; // standard-2014 固定为 8
  ownerNickname: string;
  versionId: string;
  versionName: string;
  isMember?: boolean;
  joinLabel?: '加入' | '返回';
  _v: 1;
};
```

- `versionName` 必须显示中文名，例如 `三国杀标准版·界限突破`。
- `joinLabel='返回'` 仅是文案，实际仍走 `room:join`。

### 1.3 `GET /api/capabilities`

新增字段：

```ts
{
  versions: Array<{
    id: string;
    name: string;
    minPlayers: number;
    maxPlayers: number;
    default: boolean;
  }>;
  selectingTimeoutSec: number; // default 180
}
```

- `standard-2014.maxPlayers = 8`。
- `selectingTimeoutSec` 生产默认 180，测试环境可缩短。

## 2. 规则 SSOT 与版本详情

### 2.1 `version:get`

- 形式可为 HTTP 或 socket ack，二选一即可，产品要求是只读版本详情。
- 响应需包含：版本中文名、人数范围、武将数量、卡牌目录、开放门槛提示。

```ts
type VersionDetail = {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  generals: Array<{ id: string; name: string; kingdom: string; hp: number }>;
  cards: {
    basic: string[];
    trick: string[];
    equipment: string[];
  };
  readOnly: true;
  _v: 1;
};
```

- 版本详情不允许切换版本，只读展示。

## 3. 房间加入与重进

### 3.1 `room:join`

请求保持：

```ts
{ code: string; _v: 1 }
```

服务端区分三种路径：

| 场景 | 行为 |
|---|---|
| 首次加入 | 校验版本、人数上限、房间存在性后分配座位 |
| 已在房内返回 | 同 userId + code 命中已有座位，直接返回当前状态，不新增玩家 |
| 保坐重绑 | 同 userId + code 命中 `reconnectGraceSec` 内保坐，迁移 socket 绑定与房间引用 |

失败码沿用 REQ-001：`E_ROOM_NOT_FOUND` / `E_ROOM_FULL` / `E_ROOM_VERSION_MISMATCH` / `E_UNAUTHORIZED`。

### 3.2 `room:leave`

新增语义字段：

```ts
{ code: string; reason: 'manual' | 'disconnect' | 'host-transfer' | 'room-disband'; _v: 1 }
```

- `manual`：主动退出，可能扣费。
- `disconnect`：掉线/关闭浏览器，不扣费，进入托管/保坐。
- `host-transfer`：房主轮转的内部事件，不对玩家展示扣费。
- `room-disband`：房间解散。

## 4. 房间状态广播

### 4.1 `room:state`

```ts
type RoomState = {
  status: RoomStatus;
  versionId: string;
  versionName: string;
  hostPlayerId: string;
  players: Array<{
    id: string;
    nickname: string;
    ready: boolean;
    connected: boolean;
    isHost: boolean;
    handCount?: number;
    seatIndex: number;
  }>;
  roomLifecycle?: {
    state: 'waiting' | 'selecting' | 'playing' | 'finished';
    hostTransferPending?: boolean;
    disconnectGraceUntil?: number;
  };
  selecting?: GeneralSelectionState;
  _v: 1;
};
```

### 4.2 房间状态语义

- `roomLifecycle.state='waiting'` 时，房间可再次准备并开始新局。
- `hostTransferPending=true` 表示房主已经发起轮转，服务端正在选下一位接管者。
- `disconnectGraceUntil` 只服务于托管/保坐观察，不等于主动退出。

## 5. 选将契约

### 5.1 `GeneralOption`

```ts
type GeneralOption = {
  id: string;
  name: string;
  kingdom: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number;
  maxHp: number;
  skills: Array<{ name: string; description: string }>;
};
```

### 5.2 `GeneralSelectionState`

```ts
type GeneralSelectionState = {
  currentPlayerId: string;
  currentPlayerNickname: string;
  deadlineAt: number;
  timeoutSec: 180;
  selected: Array<{
    playerId: string;
    generalId: string;
    generalName: string;
  }>;
  myOptions?: GeneralOption[];
};
```

- 主公候选数 5，其他角色候选数 3。
- 候选顺序由服务端固定下发，超时默认 `myOptions[0]`。
- `myOptions` 仅对当前选将玩家可见。

### 5.3 `general:select`

```ts
{ roomCode: string; generalId: string; _v: 1 }
```

失败事件 `room:error` 增加：

| code | 含义 |
|---|---|
| `E_NOT_SELECTING` | 当前不在选将阶段 |
| `E_NOT_YOUR_TURN` | 尚未轮到当前玩家 |
| `E_INVALID_GENERAL_OPTION` | 武将不在候选列表中 |

## 6. 版本开放门槛

- `room:create` 与 `version:switch` 都必须消费版本目录的 `maxPlayers=8`。
- 未完成规则矩阵的未来版本，不得出现在 capabilities 版本列表中。
- 版本详情只读，不提供切换或编辑能力。

## 7. 日志与可观测

- `room.lifecycle.state_changed`
- `room.host.transfer_started`
- `room.host.transfer_completed`
- `room.leave.manual`
- `room.leave.disconnect`
- `room.selecting.started`
- `room.general.selected`
- `room.general.timeout`

