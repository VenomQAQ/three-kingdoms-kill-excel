# 后端可行性复核 · REQ-2026-004 · v1

- **评审员**：backend-feasibility
- **时间**：2026-07-04T11:50+08:00
- **判定**：**pass-with-conditions**
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 归属与影响面

- 主要落点：`server/src/modules/room/room.service.ts`、`server/src/gateway/game.gateway.ts`、`packages/shared/src/index.ts`、`packages/shared/src/versions.ts`、`packages/engine/src/core/sangokushi-engine.ts`。
- 影响面：**大改**，但可分层推进。

## 2. 状态与一致性

- 房间从 `finished` 回到 `waiting`、房主轮转、主动退出扣费、托管/保坐、版本门槛都触及房间权威状态。
- 现有 `standard-2014` 版本定义仍是 2-10 人，而 PRD 写的是 2-8 人，这个冲突必须先收敛。

## 3. 事件时序

- 需要先把房间结束、重新准备、版本展示、玩家资料这些流程分离，不要在同一个同步块里做过多副作用。
- 额外 socket 事件量级不大，但状态流会变复杂，尤其是房主轮转和选将回合默认项。

## 4. 性能 / 安全

- 单房间并发压力不会明显超过现有上限，但规则矩阵、公开资料、版本详情都要避免把敏感账号字段带到前端。
- 需要补齐规则 SSOT，否则后端的卡牌/技能结算无法稳定对齐。

## 5. 成本 & 风险

- 粗估成本：**5-8 人日**。
- Top 3 风险：
  1. `standard-2014` 人数上限冲突导致创建房间、房间列表、能力接口三处不一致。
  2. `docs/cards/*.md` 规则 SSOT 缺失，后续引擎修复没有统一落点。
  3. 房间生命周期与托管/保坐/重连的优先级如果不先冻结，会引出重复回写。
- 强依赖前端：Sheet 切换和房间状态展示必须严格消费后端的单一状态，不做本地猜测。

## 6. 结论

**pass-with-conditions**：后端可以做，但先要把版本人数、规则 SSOT、房间生命周期边界写死，否则设计阶段容易反复改口径。

