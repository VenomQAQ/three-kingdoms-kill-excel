# REQ-2026-003 · UX 与玩法体验补全

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v1** | [prd/prd.v1.md](./prd/prd.v1.md) | 承接 001/002 未完成项 + 本轮 6 条优化 |
| 前端可行性 | **v1** | [review/frontend-feasibility.v1.md](./review/frontend-feasibility.v1.md) | ②评审 |
| 后端可行性 | **v1** | [review/backend-feasibility.v1.md](./review/backend-feasibility.v1.md) | ②评审 |
| QA 可测性 | **v1** | [review/qa-testability.v1.md](./review/qa-testability.v1.md) | ②评审 |
| 会签聚合 | **v1** | [review/review-signoff.v1.yaml](./review/review-signoff.v1.yaml) | ②评审 |

## 前置需求（只读引用）

| REQ | 状态 | 关系 |
|---|---|---|
| [REQ-2026-001](../REQ-2026-001-wps-account-version/INDEX.md) | ①已定稿 | 账号/大厅/单元格填满基线 |
| [REQ-2026-002](../REQ-2026-002-game-core-m3/INDEX.md) | ③开发中 | M3 锦囊/正式房大厅 |

## 版本变更日志

- **v1** · 2026-07-03 · 页面状态保持与重进房、昵称体系、锦囊响应链修复、对局区铺满、选将流程、房间内聊天输入框；承接 001/002 未完成 P0 项

## 需求点索引

- **R-CF-01~04** · 承接 REQ-2026-001/002 未完成项（本期继续交付）
- **R-UX-01~02** · 页面刷新保持 / 误回大厅可重进
- **R-ACCT-01~03** · 昵称展示与编辑 / 注册二次确认密码
- **R-ENG-01~02** · 锦囊无懈后继续结算 / 同类锦囊排查
- **R-UI-01** · 对局界面单元格铺满
- **R-GAME-01~02** · 身份分配后选将（主公 5 选 1 / 他人 3 选 1）
- **R-CHAT-01** · 房间内聊天区独立输入框
