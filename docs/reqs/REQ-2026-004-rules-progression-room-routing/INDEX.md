# REQ-2026-004 · 规则完备、房间生命周期与 Sheet 架构拆分

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v1** | [prd/prd.v1.md](./prd/prd.v1.md) | 评审会签已收口，开发中 |
| 会签聚合 | **v1** | [review/review-signoff.v1.yaml](./review/review-signoff.v1.yaml) | pass-with-conditions |
| API 契约 | **v1** | [design/api-contract.v1.md](./design/api-contract.v1.md) | 新增 |
| 后端技术方案 | **v1** | [design/backend-tech-design.v1.md](./design/backend-tech-design.v1.md) | 新增 |
| 前端技术方案 | **v1** | [design/frontend-tech-design.v1.md](./design/frontend-tech-design.v1.md) | 新增 |
| design signoff | **v1** | [design/design-signoff.v1.yaml](./design/design-signoff.v1.yaml) | pass |

## 开发进度

| 范围 | 状态 | 说明 |
|---|---|---|
| Phase 1 · Sheet 架构与房间生命周期 | 未开始 | Sheet/Ribbon 拆分、房间结束回 waiting、房主轮转、主动退出扣费确认、掉线托管状态仍待实现 |
| Phase 2 · 规则结算 | 进行中 | 已落地【闪电】未生效轮转、界张飞【替身】限定技、判定牌花色点数稳定解析；新增 TurnRunner 规则测试 |
| Phase 2 · 全卡牌/全技能矩阵 | 未完成 | 全 30 将技能真实结算、能力矩阵与前端 unsupported 限制拆除仍待推进 |
| Phase 3 · 成长经济与签到 | 延期 | 经验、金币、等级、签到与入场券扩展口保留设计，暂不进入当前开发批次 |

### 本轮代码落地

- 引擎：判定阶段保留牌面花色点数，支持稳定结算【闪电】、【乐不思蜀】、【兵粮寸断】等延时锦囊。
- 引擎：实现【闪电】判定未生效后转移到下一名存活角色判定区，生效时造成 3 点雷电伤害且不转移。
- 引擎：实现界张飞【替身】准备阶段限定技，按上回合结束体力回复并摸等量牌，发动后记录限定技状态。
- 测试：新增 `turn-runner.spec.ts` 覆盖【闪电】生效/未生效与【替身】发动/不可重复发动；引擎测试 22 例通过。

## 前置需求（只读引用）

| REQ | 状态 | 关系 |
|---|---|---|
| [REQ-2026-001](../REQ-2026-001-wps-account-version/INDEX.md) | ①已定稿 | 账号、版本目录、大厅基线 |
| [REQ-2026-002](../REQ-2026-002-game-core-m3/INDEX.md) | ③开发中 | M3 锦囊、正式房基础流程 |
| [REQ-2026-003](../REQ-2026-003-ux-gameplay-polish/INDEX.md) | ③开发中 | 重连、选将、无懈链、房间聊天、昵称体系 |

## 版本变更日志

- **v1** · 2026-07-04 · 新增 Sheet 一级入口与 Ribbon 隔离、房间生命周期闭环、标准版 2-8 人限制、规则 SSOT 与全卡牌/全技能真实结算要求、版本详情、玩家信息弹窗、成长经济延期设计。
- **dev-2026-07-04** · 2026-07-04 · 进入开发中；完成 Phase 2 首批规则修复：【闪电】轮转、界张飞【替身】、判定牌稳定解析与对应单测。

## 需求点索引

- **R-SHEET-01~04** · Sheet 一级入口、页面状态隔离、Ribbon 按 Sheet 变更、现状路由拆分
- **R-ROOM-01~05** · 房间结束回等待、房主轮转、主动退出扣费提示、托管、版本人数限制
- **R-RULE-01~08** · 规则 SSOT、卡牌效果完整、闪电轮转、选将不重复、全技能真实结算、张飞【替身】修复
- **R-UI-01~05** · 玩家/角色展示文案、技能详情文案、手牌数、玩家信息弹窗、版本详情弹窗
- **R-PROG-01~04** · 经验金币、每日签到、配置化奖励、后续入场券扩展口（延期设计）
