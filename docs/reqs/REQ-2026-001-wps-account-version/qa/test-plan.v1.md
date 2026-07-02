# 测试计划 · REQ-2026-001 · v1

- **作者**：qa-test-designer
- **时间**：2026-07-02T18:30+08:00
- **契约**：[design/api-contract.v1.md](../design/api-contract.v1.md)（frozen）
- **原则**：全 P0 用例必须过；P1 覆盖率 ≥ 95%

## 1. 范围

- 覆盖 R-1 ~ R-9 全部需求点
- **不改变**战斗规则 → 仅对现有对局跑一次冒烟集，防止 auth/version 改造回归

## 2. 策略与工具

| 层 | 工具 | 比重 |
|---|---|---|
| 后端单测 | Jest（沿用 Nest 默认） | ~30% |
| 集成（HTTP + Socket） | Jest + supertest + socket.io-client | ~40% |
| E2E（前端 + 后端 dev 启动） | Playwright | ~25% |
| 视觉基线 | Playwright + pixelmatch | ~5% |

- **时间快进**：QA 使用 `POST /api/debug/advance-clock`（ENABLE_DEBUG_CLOCK=true 环境）
- **随机 seed**：本需求无随机；对局冒烟集用现有 `SangokushiEngine` 已有的可控入口

## 3. 环境

- 本地：`ENABLE_DEBUG_CLOCK=true`, `SANDBOX_ENABLED=true`
- 联调 / staging：同上
- 预发（预上线前）：`SANDBOX_ENABLED=false`, `ENABLE_DEBUG_CLOCK=false`；QA 手工验收此环境的 sandbox 隐藏 + refresh 用例改为验证接口不存在

## 4. 视觉基线（R-1 / R-2）

- **基线目录**：`docs/reqs/REQ-2026-001-wps-account-version/qa/baseline/`
- **分辨率**：1440×900、1920×1080、2560×1440 各一套
- **判据**：
  - **像素**：非 `--bg-cell` 颜色像素 / 视口面积 ≤ 3%（±0.3%）
  - **对齐**：抓取 `SpreadsheetGrid` DOM 网格线，各列右边界像素坐标应对齐（相邻两列间距 std ≤ 1px）
- **场景快照**：首屏未登录、登录后大厅、Ribbon 折叠、聊天区隐藏、老板键切"区域销售"、对局面板

## 5. 出牌流程冒烟集（不回归全部技能，防炸即可）

| 场景 | 说明 |
|---|---|
| 主公摸牌阶段 → 出牌 → 弃牌 → 下一角色 | 现有基本回合流转不变 |
| 【杀】响应【闪】 | 响应窗口未改，防止 auth 改动干扰 |
| 濒死【桃】救助 | 救助流程未改 |
| 【决斗】轮流出【杀】 | 最近上线的技能，保护面 |
| 【恂恂】摸牌前观 4 顶 2 沉 2 | 最近上线的技能 |

## 6. 用例分组（详见 test-cases.v1.yaml）

| 分组 | 数量估算 | 需求点 |
|---|---|---|
| Auth · 注册 | 6 | R-3 |
| Auth · 登录 / 登出 | 8 | R-4 |
| Auth · 改密 | 5 | R-5 |
| Auth · Refresh 旋转 | 5 | R-4 |
| Session · 断线保坐 | 4 | R-4 |
| Version · 目录 & 切换 | 4 | R-6 |
| Room · 容量按版本 | 3 | R-7 |
| Lobby Chat · 快照 / 广播 / 限流 / 长度 | 8 | R-8, R-9 |
| Auth Gate · 未登录只读 | 5 | R-9 |
| Sandbox · 环境开关 | 3 | R-9 |
| Visual · R-1/R-2 三档基线 | 6 | R-1, R-2 |
| Regression · 出牌流程冒烟 | 5 | 全部 |

**合计 ~62 条用例**（P0 ≥ 40 / P1 ≥ 20）。

## 7. 缺陷回退策略（对齐 agent 规则）

- P0 缺陷：立即交回对应端 `*-coder`，`code-reviewer` 陪审；修复回来后只重跑相关用例 + 邻接回归
- P1 缺陷：记录到 `test-report`，同批次修复后重跑
- P2 缺陷：不阻塞发布，登记待办

## 8. 报告输出

- `qa/test-report.v1.md`：每轮 QA 执行后追加
- 缺陷单：格式见 `qa-tester` agent 定义（BUG-N，含 ref_case / 归属 / 复现步骤 / 期望 vs 实际）
