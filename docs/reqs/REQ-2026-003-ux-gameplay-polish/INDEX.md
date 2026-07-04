# REQ-2026-003 · UX 与玩法体验补全

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v2** | [prd/prd.v2.md](./prd/prd.v2.md) | 消解三审产品条件；v1 保留只读 |
| 前端可行性 | **v2** | [review/frontend-feasibility.v2.md](./review/frontend-feasibility.v2.md) | pass；v1 保留 |
| 后端可行性 | **v2** | [review/backend-feasibility.v2.md](./review/backend-feasibility.v2.md) | pass；v1 保留 |
| QA 可测性 | **v2** | [review/qa-testability.v2.md](./review/qa-testability.v2.md) | pass；v1 保留 |
| 会签聚合 | **v2** | [review/review-signoff.v2.yaml](./review/review-signoff.v2.yaml) | ②已通过 |
| API 契约 (SSOT) | **v1** | [design/api-contract.v1.md](./design/api-contract.v1.md) | frozen: true |
| 后端技术方案 | **v1** | [design/backend-tech-design.v1.md](./design/backend-tech-design.v1.md) | room:join 重进 + 正式房选将 + 无懈断链 |
| 前端技术方案 | **v1** | [design/frontend-tech-design.v1.md](./design/frontend-tech-design.v1.md) | 消费冻结契约 |
| 开发自测报告 | **v1** | [qa/dev-smoke-report.v1.md](./qa/dev-smoke-report.v1.md) | unit/build pass；视觉基线待 QA |

## 前置需求（只读引用）

| REQ | 状态 | 关系 |
|---|---|---|
| [REQ-2026-001](../REQ-2026-001-wps-account-version/INDEX.md) | ①已定稿 | 账号/大厅/单元格填满基线 |
| [REQ-2026-002](../REQ-2026-002-game-core-m3/INDEX.md) | ③开发中 | M3 锦囊/正式房大厅 |

## 版本变更日志

- **v1** · 2026-07-03 · 页面状态保持与重进房、昵称体系、锦囊响应链修复、对局区铺满、选将流程、房间内聊天输入框；承接 001/002 未完成 P0 项
- **v2** · 2026-07-03 · 消解三审产品问题：复用 `room:join`、正式房 `room.status='selecting'`、180s 超时默认候选 `index=0`、测试房保留原自定义角色逻辑、对局日志武将名主展示；三审 v2 全 pass；产出 API/后端/前端设计 v1
- **dev-smoke v1** · 2026-07-03 · 代码实现后完成服务端选将单测、引擎回归、前后端 build 自测；浏览器视觉基线留待 QA

## 需求点索引

- **R-CF-01~04** · 承接 REQ-2026-001/002 未完成项（本期继续交付）
- **R-UX-01~02** · 页面刷新保持 / 误回大厅可重进
- **R-ACCT-01~03** · 昵称展示与编辑 / 注册二次确认密码
- **R-ENG-01~02** · 锦囊无懈后继续结算 / 同类锦囊排查
- **R-UI-01** · 对局界面单元格铺满
- **R-GAME-01~02** · 身份分配后选将（主公 5 选 1 / 他人 3 选 1）
- **R-CHAT-01** · 房间内聊天区独立输入框
