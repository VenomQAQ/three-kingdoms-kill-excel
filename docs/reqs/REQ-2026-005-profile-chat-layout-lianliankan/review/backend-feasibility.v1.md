# 后端可行性评审 · REQ-2026-005 · v1

- **评审角色**：backend-feasibility
- **结论**：pass-with-questions
- **时间**：2026-07-05
- **输入**：[PRD v1](../prd/prd.v1.md)

## 1. 总体判断

后端可实现。账号实体已有金币、经验、等级字段，socket 已有钱包变更事件；聊天消息已有 `timestamp`；房间与玩家已有昵称。新增部分主要是玩家资料查询、战绩存储/聚合、连连看 session 与钱包流水。若本期要完成金币闭环，必须避免只在前端本地判定胜利后直接派奖。

## 2. 领域拆分建议

| 模块 | 职责 |
|---|---|
| auth/user | 返回当前用户等级、昵称、金币；提供玩家公开资料 |
| stats | 记录/聚合三国杀胜负战绩 |
| wallet | 金币扣除、奖励、幂等流水、广播钱包变化 |
| lianliankan | 创建单人局、记录棋盘摘要、结算、失败/过期 |
| chat | 继续使用已有 timestamp，无需改存储结构 |

## 3. API 建议

### 3.1 玩家资料

`GET /api/users/:userId/profile`

返回：

```json
{
  "userId": "usr_xxx",
  "nickname": "阿明",
  "level": 3,
  "coins": 128,
  "stats": {
    "total": 12,
    "wins": 5,
    "losses": 7,
    "winRate": 0.4167
  },
  "updatedAt": 1783267200000,
  "_v": 1
}
```

### 3.2 连连看

- `POST /api/lianliankan/sessions`：校验登录与金币，扣 5 金币，创建 session，返回棋盘种子/棋盘。
- `POST /api/lianliankan/sessions/:id/finish`：提交胜利/失败，校验 session 幂等，胜利发奖。
- `GET /api/lianliankan/config`：返回主题、难度与奖励配置。

## 4. 关键规则

- 扣费与奖励必须在事务内完成。
- session 有状态：`playing`、`won`、`lost`、`expired`。
- `finish` 对已结算 session 返回当前结果，不重复奖励。
- 超过难度时间窗口提交胜利，应判失败或拒绝奖励。
- 棋盘可由后端生成并返回，或后端存 seed + 配置；为减少作弊，建议后端生成棋盘并存摘要。

## 5. 风险与疑问

| 编号 | 问题 | 影响 | 建议 |
|---|---|---|---|
| BE-Q1 | 公开资料是否展示金币 | 隐私边界 | v2 明确：本期展示金币，后续可隐私化 |
| BE-Q2 | 现有 `RoomPlayer.id` 是 socket playerId 还是 userId | 资料查询映射风险 | shared 增加 `userId?: string` |
| BE-Q3 | 战绩数据来源当前不完整 | 资料弹窗字段可能无数据 | 本期先落 stats 表/服务，历史为 0 |
| BE-Q4 | 连连看路径校验放前端还是后端 | 作弊与实现成本 | 本期后端校验时长/状态/棋盘摘要，路径过程前端；后续强化逐步上报操作 |
| BE-Q5 | 金币不足错误码未定义 | 前端提示不稳定 | 新增 `E_WALLET_INSUFFICIENT_COINS` |

## 6. 结论

通过，但 PRD v2 和 API 设计需明确公开资料隐私、playerId/userId 映射、连连看扣奖幂等与错误码。

