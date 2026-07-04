# 后端技术方案 · REQ-2026-004 · v1

- **作者**：backend-design
- **时间**：2026-07-04T13:30+08:00
- **消费 PRD**：[prd.v1.md](../prd/prd.v1.md)
- **消费契约**：[api-contract.v1.md](./api-contract.v1.md)

## 1. 落点

```
server/src/
├── gateway/game.gateway.ts          ← room:join / room:leave / general:select / version 命令
├── modules/room/room.service.ts     ← room lifecycle / host transfer / selecting
├── modules/game/game.service.ts     ← selecting 完成后创建并启动 engine
├── modules/version/version.registry.ts ← 中文版本名 + 人数 + 详情
├── modules/rules/rules-index.service.ts ← SSOT 聚合（docs/cards + docs/gameplay + versions）
└── modules/room/room-lifecycle.ts    ← 生命周期语义与日志封装
```

## 2. 版本口径

- `standard-2014` 固定 `minPlayers=2`、`maxPlayers=8`。
- `RoomService.createRoom` 不再默认吃 10 人兜底；若版本缺失，直接报错。
- `room:list`、`room:create`、`room:join` 全部读版本注册表，不在业务层写死常量。

## 3. 规则 SSOT

### 3.1 聚合方式

- `docs/cards/basic.md`、`docs/cards/trick.md`、`docs/cards/equipment.md`、`docs/cards/characters.md`、`docs/cards/identity.md` 作为文档源。
- `docs/gameplay.md` 作为交互与身份分配源。
- `packages/shared/src/versions.ts` 作为版本目录源。
- `rules-index.service.ts` 负责把这些内容归并成版本详情和校验结果。

### 3.2 输出

- 版本详情用于只读弹窗与房间列表版本列。
- 规则矩阵用于设计/测试检查，不要求本轮做成独立 API。

## 4. 生命周期状态机

### 4.1 房间结束回等待

```
playing -> finished -> waiting
```

- `finished` 只允许在结算同步期间存在。
- 结算广播完成后，保留座位、聊天和房间代码，清空准备态，回到 `waiting`。

### 4.2 房主轮转

- 房主离开时先选下一位真实在线玩家作为新房主。
- 选中后广播 `room.lifecycle.state_changed`，再更新 `room:state`。
- 若没有可接管玩家，直接解散房间。

### 4.3 主动退出扣费

- `selecting/playing` 中主动点击离开，进入 `manual` 路径。
- 扣 5 金币，最低到 0。
- 扣费与移出动作在同一事务式同步块完成，避免先广播后扣费的错序。

### 4.4 掉线托管

- `disconnect` 路径不扣费。
- 断线后进入 `disconnectGraceUntil` 观察期。
- 观察期内同 `userId` 重连，认领原座位。
- 若房主掉线，则只在可接管玩家存在时轮转，否则按解散策略处理。

## 5. 选将流程

### 5.1 正式房开始

1. 房主调用 `room:start`。
2. 服务端校验人数 2-8、准备状态、版本可用。
3. 分配身份并进入 `selecting`。
4. 按座次生成候选池，主公 5 个、其余 3 个。
5. 写入 `GeneralSelectionState` 并广播。

### 5.2 轮转与超时

- 当前玩家确认或超时后，继续下一个玩家。
- 超时默认 `myOptions[0]`。
- 全员完成后，构建对局引擎，切到 `playing`。

## 6. 风险控制

- 房间 lifecycle 与选将都在 `RoomService` 单线程内串行处理，避免重复回写。
- `rules-index.service` 只做聚合，不把规则源复制到数据库，减少 SSOT 变体。
- 版本人数和文案统一从版本注册表输出，杜绝前后端口径分叉。

## 7. 验收映射

| AC | 后端要点 |
|---|---|
| AC-ROOM-01 | `finished -> waiting`，保座与聊天保留 |
| AC-ROOM-02 | 房主轮转与解散 |
| AC-ROOM-03 | 主动退出扣费 |
| AC-ROOM-04 | 掉线不扣费，进入托管/保坐 |
| AC-ROOM-05 | 2-8 人限制 |
| AC-RULE-01~05 | 版本详情与规则 SSOT |
| AC-UI-04 | 中文版本名 |

