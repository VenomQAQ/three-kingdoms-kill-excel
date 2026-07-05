# REQ-2026-005 · 玩家信息、聊天时间、战场铺满与连连看

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v2** | [prd/prd.v2.md](./prd/prd.v2.md) | 三审问题已消解 |
| 前端可行性 | **v1** | [review/frontend-feasibility.v1.md](./review/frontend-feasibility.v1.md) | pass-with-questions，已由 PRD v2 消解 |
| 后端可行性 | **v1** | [review/backend-feasibility.v1.md](./review/backend-feasibility.v1.md) | pass-with-questions，已由 PRD v2 消解 |
| QA 可测性 | **v1** | [review/qa-testability.v1.md](./review/qa-testability.v1.md) | pass-with-questions，已由 PRD v2 消解 |
| 会签汇总 | **v1** | [review/review-signoff.v1.yaml](./review/review-signoff.v1.yaml) | 产品问题已消解 |
| API 契约 (SSOT) | **v1** | [design/api-contract.v1.md](./design/api-contract.v1.md) | frozen |
| 后端技术方案 | **v1** | [design/backend-tech-design.v1.md](./design/backend-tech-design.v1.md) | ready |
| 前端技术方案 | **v1** | [design/frontend-tech-design.v1.md](./design/frontend-tech-design.v1.md) | ready |
| 测试计划 | **v1** | [qa/test-plan.v1.md](./qa/test-plan.v1.md) | ready |
| 测试用例 | **v1** | [qa/test-cases.v1.yaml](./qa/test-cases.v1.yaml) | ready |
| 验收证据 | **v1** | [qa/acceptance-evidence.v1.md](./qa/acceptance-evidence.v1.md) | build passed |
| 后端任务 | **v1** | [tasks/backend-tasks.v1.yaml](./tasks/backend-tasks.v1.yaml) | ready |
| 前端任务 | **v1** | [tasks/frontend-tasks.v1.yaml](./tasks/frontend-tasks.v1.yaml) | ready |

## 前置需求

| REQ | 状态 | 关系 |
|---|---|---|
| [REQ-2026-001](../REQ-2026-001-wps-account-version/INDEX.md) | 已定稿 | 账号、金币、WPS 单元格铺满基线 |
| [REQ-2026-003](../REQ-2026-003-ux-gameplay-polish/INDEX.md) | 开发中 | 昵称展示、房间聊天、战场铺满前置 |
| [REQ-2026-004](../REQ-2026-004-rules-progression-room-routing/INDEX.md) | 开发中 | 对局规则与日志展示前置 |

## 版本变更日志

- **v1 · 2026-07-05**：首版 PRD，覆盖去“界”、聊天时间、玩家信息、账号栏、战场侧栏/铺满、连连看 Sheet 与金币闭环；三审提出待消解问题。
- **v2 · 2026-07-05**：消解三审问题，固化公开资料字段、TitleBar 位置、RoomPlayer.userId、连连看后端扣奖边界、3% 铺满判据与错误码。

## 需求点索引

- **R-UI-01** · 武将名前缀“界”全局展示去除
- **R-CHAT-01** · 聊天记录显示发送时间
- **R-PROFILE-01~02** · 玩家名称可点击查看玩家资料与战绩
- **R-ACCOUNT-01** · 右上角账号信息展示等级、昵称、金币
- **R-BATTLE-01~02** · 战场操作记录折叠重做与单元格铺满
- **R-LLK-01~08** · 连连看 Sheet、主题、难度、时间、金币、竞速预留、WPS 样式
