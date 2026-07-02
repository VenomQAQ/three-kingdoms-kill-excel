# REQ-2026-001 · WPS 摸鱼版 · 账号 + 版本切换 + 全局聊天区 + 单元格填满

## 当前生效版本

| 产物 | 版本 | 路径 | 备注 |
|---|---|---|---|
| PRD | **v2** | [prd/prd.v2.md](./prd/prd.v2.md) | 消解 v1 三方 9 条条件；v1 保留只读 |
| 前端可行性 | **v2** | [review/frontend-feasibility.v2.md](./review/frontend-feasibility.v2.md) | pass；v1 保留 |
| 后端可行性 | **v2** | [review/backend-feasibility.v2.md](./review/backend-feasibility.v2.md) | pass；v1 保留 |
| QA 可测性 | **v2** | [review/qa-testability.v2.md](./review/qa-testability.v2.md) | pass；v1 保留 |
| 会签聚合 | **v2** | [review/review-signoff.v2.yaml](./review/review-signoff.v2.yaml) | ②已通过 |
| 后端技术方案 | — | — | 待 ②通过后开工 |
| API 契约 (SSOT) | — | — | 待 ②通过后开工 |
| 前端技术方案 | — | — | 待 契约冻结 |
| 后端任务清单 | — | — | |
| 前端任务清单 | — | — | |
| 后端代码评审 | — | — | |
| 前端代码评审 | — | — | |
| 联调签核 | — | — | |
| 测试计划 | — | — | 允许②③预备 |
| 测试用例 | — | — | 允许②③预备 |
| 测试报告 | — | — | |
| 生命周期 | — | [lifecycle.yaml](./lifecycle.yaml) | 无版本号，追加式 |

## 版本变更日志

- **v1** · 2026-07-02 · prd-author 起草 PRD + 三方评审并行签核（均 pass-with-conditions，共 9 条）
- **v2** · 2026-07-02 · prd-author 消解 9 条条件（未登录只读 / sandbox 生产关 / JWT 双 token 5min 保坐 / 改密全失效 / 大厅 1000-100-1-200 / Ribbon 版本主 / SQLite / R-2 三档基线）→ 待三方复核

## 需求点索引（供 tasks / test-cases 追溯 ref_req）

- **R-1** · WPS 表格外壳风格锁定
- **R-2** · 单元格填满：所有空白区必须由对齐单元格网格覆盖
- **R-3** · 账号注册（QQ 邮箱作为账号）
- **R-4** · 账号登录 / 登出
- **R-5** · 修改密码（登录态）
- **R-6** · 三国杀版本目录 & 切换（初期只上《标准版·界限突破》）
- **R-7** · 房间容量随版本决定
- **R-8** · 房间列表右侧全局聊天区（游戏前，所有在线玩家可见）
- **R-9** · 未登录访问的兜底策略
