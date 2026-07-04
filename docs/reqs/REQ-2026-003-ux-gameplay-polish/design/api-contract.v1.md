# API / 事件契约 · REQ-2026-003 · v1 [SSOT]

- **状态**：`version: v1`，`frozen: true`（PRD v2 三审通过后冻结）
- **作者**：backend-design
- **时间**：2026-07-03T18:35+08:00
- **消费 PRD**：[prd.v2.md](../prd/prd.v2.md)
- **前置契约**：REQ-2026-001 `api-contract.v1.md`；本契约只描述增量/覆盖项

## 1. Room 状态与列表

### 1.1 `RoomStatus`

```ts
type RoomStatus = 'waiting' | 'selecting' | 'playing' | 'finished';
```

- `selecting` 仅用于正式房选将阶段。
- 测试房 sandbox 保留原调试流程，不强制进入 `selecting`。

### 1.2 `RoomBrief` 增量

```ts
type RoomBrief = {
  code: string;
  status: 'waiting' | 'selecting' | 'playing' | 'finished';
  playerCount: number;
  maxPlayers: number;
  ownerNickname: string;
  versionId: string;
  isMember?: boolean;
  joinLabel?: '加入' | '返回';
  _v: 1;
};
```

- `isMember=true` 表示当前登录用户仍在该房间或保坐期内可返回。
- `joinLabel='返回'` 仅用于展示；实际动作仍发送 `room:join`。

## 2. `room:join` 复用语义

### 2.1 client → server `room:join`

请求沿用：

```ts
{ code: string; _v: 1 }
```

服务端必须区分三类场景：

| 场景 | 行为 |
|---|---|
| 首次加入 | 校验房间、版本、容量后占新座位 |
| 已在房内返回 | 同 userId + code 已存在座位，直接回传当前 `room:state`，不新增玩家 |
| 保坐重绑 | 同 userId + code 命中 reconnectGraceSec 内保留座位，迁移 socket/playerId 绑定并回传当前状态 |

失败码沿用 REQ-001：`E_ROOM_NOT_FOUND` / `E_ROOM_FULL` / `E_ROOM_VERSION_MISMATCH` / `E_UNAUTHORIZED`。对 `selecting` / `playing` 中已是成员的用户，`room:join` 不返回 `E_ROOM_STARTED`，而是返回原座位；非成员仍不可加入已开始房间。

## 3. 正式房选将事件

### 3.1 `room:state` 增量

```ts
type GeneralOption = {
  id: string;
  name: string;
  maxHp: number;
  hp?: number;
  skills: Array<{ name: string; description: string }>;
};

type GeneralSelectionState = {
  currentPlayerId: string;
  currentPlayerNickname: string;
  deadlineAt: number;          // epoch ms
  timeoutSec: 180;
  selected: Array<{ playerId: string; generalId: string; generalName: string }>;
  myOptions?: GeneralOption[]; // 仅当前 socket 对应玩家可见
};

type RoomState = {
  status: RoomStatus;
  generalSelection?: GeneralSelectionState;
  _v: 1;
};
```

- 候选列表由服务端权威下发。
- `myOptions` 只发给当前该选将玩家；旁观/其他玩家只看到等待人与已选结果。
- 候选数组顺序在本次 prompt 内稳定；超时默认 `myOptions[0]`。

### 3.2 client → server `general:select`

```ts
{ roomCode: string; generalId: string; _v: 1 }
```

校验：

- 房间必须为正式房且 `room.status='selecting'`。
- 发送者必须是 `currentPlayerId`。
- `generalId` 必须属于当前玩家候选列表。

失败事件：`room:error`，错误码新增：

| code | 含义 |
|---|---|
| `E_NOT_SELECTING` | 当前房间不在选将阶段 |
| `E_NOT_YOUR_TURN` | 尚未轮到当前玩家选将 |
| `E_INVALID_GENERAL_OPTION` | 提交的武将不在候选列表中 |

## 4. 昵称与日志展示

### 4.1 `user:nicknameChanged`

```ts
{ userId: string; nickname: string; _v: 1 }
```

- 改昵称成功后广播给该用户所在房间与大厅相关订阅者。
- 后续 `room:state`、聊天消息、房间列表均使用新昵称。

### 4.2 对局日志

```ts
type GameLogEntry = {
  id: string;
  ts: number;
  actorPlayerId?: string;
  actorNickname?: string;
  actorGeneralName?: string;
  text: string;       // 服务端生成的展示文本，动作主体优先武将名
  _v: 1;
};
```

- 对局动作日志 `text` 以武将名为主，例如「关羽使用【杀】」。
- 邮箱不得进入 `text`。

## 5. 能力配置增量

`GET /api/capabilities` 的 `data` 增加：

```ts
{
  selectingTimeoutSec: 180;
  bgColorToken: string;
}
```

- 测试环境可通过环境变量覆盖 `selectingTimeoutSec` 为较短值。
- 生产默认 180。
