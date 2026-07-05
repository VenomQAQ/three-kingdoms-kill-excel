# 后端技术方案 · REQ-2026-005 · v1

- **状态**：ready-for-implementation
- **时间**：2026-07-05
- **依据**：[PRD v2](../prd/prd.v2.md)、[API 契约 v1](./api-contract.v1.md)

## 1. 模块划分

| 模块 | 变更 |
|---|---|
| auth/user | 增加公开资料查询，返回等级金币战绩 |
| room | `RoomPlayer` 下发 `userId` |
| wallet | 抽取扣费/奖励工具，保证事务与广播 |
| lianliankan | 新增配置、session 创建、结算接口 |
| stats | 本期提供三国杀战绩 0 值聚合或轻量实体，为后续对局结算接入预留 |

## 2. 数据模型

### 2.1 LianliankanSessionEntity

建议表名：`lianliankan_session`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(26) PK | sessionId |
| userId | varchar(26), index | 用户 |
| mode | varchar(16) | `solo` / `race` |
| roomId | varchar(26), nullable | 竞速预留 |
| themeId | varchar(32) | 主题 |
| difficultyId | varchar(16) | 难度 |
| status | varchar(16) | playing/won/lost/expired |
| rows | int | 行 |
| cols | int | 列 |
| timeLimitSec | int | 时限 |
| entryFee | int | 入场费 |
| rewardCoins | int | 奖励 |
| boardJson | text | 棋盘 tile 列表 |
| startedAt | datetime | 开始时间 |
| deadlineAt | datetime | 截止时间 |
| finishedAt | datetime nullable | 结束时间 |
| createdAt/updatedAt | datetime | 审计 |

### 2.2 PlayerStats

本期可先不建历史明细，仅在公开资料服务返回 0 值。若实现轻量实体，建议：

| 字段 | 类型 | 说明 |
|---|---|---|
| userId | varchar(26) PK | 用户 |
| total | int | 总局数 |
| wins | int | 胜场 |
| losses | int | 负场 |
| updatedAt | datetime | 更新时间 |

## 3. 服务流程

### 3.1 创建连连看局

1. 校验登录。
2. 校验主题和难度配置。
3. 开启事务。
4. 锁定/读取用户金币；不足 5 返回 `E_WALLET_INSUFFICIENT_COINS`。
5. 扣除 5 金币。
6. 按主题、难度生成成对棋盘，并随机打散。
7. 写入 session，状态 `playing`。
8. 提交事务。
9. 广播 `user:walletChanged`。
10. 返回 session 与钱包。

### 3.2 结算连连看局

1. 校验登录。
2. 查询 session 必须属于当前用户。
3. 若状态非 `playing`，返回幂等结果，不发奖。
4. 若提交胜利但服务端当前时间超过 `deadlineAt`，状态改为 `expired`，不发奖。
5. 若 `result='won'` 且 `remainingTiles=0`，状态改为 `won`，奖励金币。
6. 其它情况状态改为 `lost`，不奖励。
7. 广播钱包变化。

## 4. 棋盘生成

- 从主题 items 中选择 `kindCount` 个 item。
- 生成 `rows * cols / 2` 对 tile。
- 高难度按 `similarGroupWeight` 提高相似组 item 占比。
- 若主题 item 数不足，则允许同 item 多对重复，但总 tile 数必须为偶数。

## 5. 风险控制

- 本期不复算完整连线路径，后端只校验 session、超时、幂等和 `remainingTiles=0`。
- 因奖励额度较低，接受前端路径计算的产品风险；后续 race 模式再升级操作上报。
- 钱包变更必须集中封装，避免扣费成功但 session 创建失败。

