# QA 可测性评审 · REQ-2026-003 · v1

- **评审员**：qa-testability
- **时间**：2026-07-03T17:35+08:00
- **判定**：**pass** ✅
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 逐条需求点可测性

| 需求点 | 可测 | 观察点 | 备注 |
|---|---|---|---|
| R-CF-01 | ✅ | 引擎日志 + 手牌变化 | 沿用 REQ-002 TR 系列 |
| R-CF-02 | ✅ | TargetQueue 逐目标 prompt | 与 R-ENG-01 合并验收 |
| R-CF-03 | ✅ | 判定日志 + 体力不变 | AOE-05 |
| R-CF-04 | ✅ | LOBBY 系列 | 沿用 formal-room-test-plan |
| R-CF-05 | ✅ | 大厅像素扫描 | 回归 |
| R-CF-06 | ✅ | 账号/聊天用例 | 回归 |
| R-UX-01 | ✅ | 刷新后 activeSheet + room.code | sessionStorage 可查 |
| R-UX-02 | ✅ | 房间列表「返回」+ 一键回房 | UI 文案 + 座位 id 不变 |
| R-ACCT-01 | ✅ | 各区域文本 grep 无 `@qq.com` | 截图 + 自动化文本断言 |
| R-ACCT-02 | ✅ | API 200 + room:state nickname 更新 | 限流用连点 2 次 |
| R-ACCT-03 | ✅ | 前端拦截，network 无 register 请求 | |
| R-ENG-01 | ✅ | 南蛮：无懈不出后仍有 N 个【杀】响应 prompt | **P0 缺陷用例** |
| R-ENG-02 | ✅ | 7 项锦囊排查清单逐项勾选 | PRD §4.4 表 |
| R-UI-01 | ✅ | 对局 Sheet 像素 ≤3% | 新基线 `qa/baseline/game-sheet/` |
| R-GAME-01 | ✅ | status=selecting → 主公 5 选项 → 反贼 3 选项 → playing | |
| R-GAME-02 | ✅ | 60s 不选自动选第一张 | 需 mock clock 或 dev 缩时 |
| R-CHAT-01 | ✅ | ChatPanel 输入框发送消息出现在列表 | |

## 2. 新增用例系列（建议 test-plan.v1 收录）

| 用例 ID | 标题 | ref |
|---|---|---|
| UX-01 | 等待大厅刷新保持 | AC-UX-01 |
| UX-02 | 对局中断线刷新恢复 prompt | AC-UX-02 |
| UX-03 | 切 Sheet 回大厅再返回 | AC-UX-03 |
| UX-04 | 保坐期外不可返回 | R-UX-02 边界 |
| ACCT-01 | 全局昵称无邮箱 | AC-ACCT-01 |
| ACCT-02 | 注册确认密码不一致 | AC-ACCT-02 |
| ACCT-03 | 修改昵称同步 | AC-ACCT-03 |
| ENG-01 | 南蛮无懈不出后继续 | AC-ENG-01 |
| ENG-02 | 万箭无懈不出后继续 | AC-ENG-02 |
| ENG-03 | 锦囊排查清单 7/7 | AC-ENG-03 |
| UI-01 | 对局区 1440×900 像素 | AC-UI-01 |
| SEL-01 | 2人局选将流程 | AC-GAME-01 |
| SEL-02 | 选将超时默认 | AC-GAME-02 |
| CHAT-01 | 房间聊天输入框 | AC-CHAT-01 |

## 3. 测试基础设施

| 设施 | 用途 | 状态 |
|---|---|---|
| `debug:advanceClock` 或 `SELECTING_TIMEOUT_SEC=5` 环境变量 | SEL-02 超时 | 建议 backend-design 提供 |
| `qa/baseline/game-sheet/` 截图 | UI-01 视觉 | 需新建 |
| 引擎单测 `card-play-service` 无懈→AOE | ENG-01/02 | 建议 unit-tester 补充 |
| 双浏览器窗口 | UX/SEL/ENG 联调 | 已有 |

## 4. 三国杀专项核查

- **技能牌**：§4.4 排查表覆盖主要多段锦囊；单目标锦囊（过河拆桥）无 AOE 队列，无懈后行为明确（抵消则无事发生）。
- **随机性**：选将候选由服务端 shuffle，测试需 **seed 注入**（`engine.setSeed` 或 room 创建时 `debugSeed`）方可稳定回归 SEL 系列。
- **连锁**：南蛮+濒死（AOE-03）需在 ENG-01 通过后叠加回归。

## 5. 判定

**pass** ✅：全部需求点可观察、可判定；AC 表与 §1.3 成功指标数值化；仅选将超时与 refresh token 类用例依赖 dev 缩时（常规基础设施，不阻断）。

## 6. 遗留提请

- 请 `backend-design` 在契约中暴露 `selectingTimeoutSec`（默认 60，测试环境可设 5）。
- 请 `frontend-design` 暴露对局区 `data-bg-token` 供像素脚本读取（延续 REQ-001 做法）。
