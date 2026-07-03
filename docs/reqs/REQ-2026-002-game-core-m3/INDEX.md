# REQ-2026-002 · 游戏核心 M3 + 正式房大厅

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v1** | [prd/prd.v1.md](./prd/prd.v1.md) | 含 M3 锦囊/装备 + 正式房等待大厅 |
| 前端技术方案 | **v1** | [design/frontend-tech-design.v1.md](./design/frontend-tech-design.v1.md) | LobbyGrid 准备交互 + playerId 对齐 |
| 后端技术方案 | **v1** | [design/backend-tech-design.v1.md](./design/backend-tech-design.v1.md) | auth:hello.playerId + 正式房 Gateway |
| 手工测试用例 | — | [../../qa/formal-room-test-plan.md](../../qa/formal-room-test-plan.md) | LOBBY / ID / GW / AOE / TR 系列 |

## 版本变更日志

- **v1** · 2026-07-03 · M3 锦囊（五谷丰登/借刀杀人）、AOE TargetQueue、八卦阵/木牛流马、正式房等待大厅准备/开始、断线重连 playerId 对齐

## 需求点索引

- **R-M3-01~05** · M3 锦囊与装备
- **R-FR-01~05** · 正式房等待大厅（Ribbon/表格/公式栏准备、playerId 不受 sandbox 污染、重连对齐）
