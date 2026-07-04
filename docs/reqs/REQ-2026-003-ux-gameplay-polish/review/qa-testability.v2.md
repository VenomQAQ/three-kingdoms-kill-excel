# QA 可测性复核 · REQ-2026-003 · v2

- **评审员**：qa-testability
- **时间**：2026-07-03T18:20+08:00
- **判定**：**pass**
- **消费 PRD**：[prd/prd.v2.md](../prd/prd.v2.md)
- **v1 参考**：[qa-testability.v1.md](./qa-testability.v1.md)

## 1. v2 关键变更可测性

| 需求点 | 可测 | 观察点 | 备注 |
|---|---|---|---|
| R-UX-01/02 | 是 | `room:join` 后座位 id 不变、activeSheet 恢复 | 覆盖等待/选将/对局三态 |
| R-ACCT-01 | 是 | 首页/房间列表/聊天/状态栏文本无邮箱 | 账号表单例外 |
| R-ACCT-04 | 是 | 对局日志动作主体为武将名 | 可断言「关羽使用【杀】」类日志 |
| R-GAME-01/02 | 是 | `room.status='selecting'`、主公 5 候选、其他 3 候选 | 正式房限定 |
| R-GAME-03 | 是 | 候选卡包含名称、技能、体力/血量；180s 超时默认 index=0 | 需 dev 缩时或 clock 控制 |
| R-SBX-01 | 是 | sandbox 可自定义武将并快速开局 | 防止正式房状态机污染测试房 |
| R-ENG-01/02 | 是 | 无懈 pass 后继续 TargetQueue/主体结算 | 继续沿用 ENG 系列 |
| R-UI-01 | 是 | game-sheet 三档像素基线 | 范围新增 selecting |

## 2. 新增/调整用例

| 用例 ID | 标题 | ref |
|---|---|---|
| UX-05 | 选将中刷新后恢复当前候选与倒计时 | AC-UX-04 |
| ACCT-04 | 首页/房间列表/聊天/状态栏昵称替代邮箱 | AC-ACCT-01 |
| LOG-01 | 对局日志动作主体为武将名 | AC-ACCT-04 |
| SEL-01 | 正式房 2 人局主公 5 选 1、反贼 3 选 1 | AC-GAME-01 |
| SEL-02 | 选将候选展示名称、技能、体力/血量 | AC-GAME-03 |
| SEL-03 | 180s 超时默认候选 index=0 | AC-GAME-02 |
| SBX-01 | 测试房自定义角色/武将快速开局 | AC-SBX-01 |
| UI-02 | 选将 Sheet 纳入 game-sheet 像素基线 | AC-UI-01 |

## 3. 测试基础设施要求

- `selectingTimeoutSec` 默认 180；测试环境需可配置为 5 秒或通过 debug clock 快进。
- 选将候选顺序需可预测，建议支持 debug seed 或测试 fixture，以稳定断言 `index=0`。
- game-sheet 视觉基线新增等待、选将、对局三类截图，路径由 QA/design 建议为 `qa/baseline/game-sheet/`。
- 文本断言需排除登录、注册、改密等账号表单中的邮箱字段。

## 4. 判定

**pass**：v2 所有新增产品决议均有明确观察点与验收口径；测试房保留原逻辑降低引擎/规则回归成本。`selectingTimeoutSec` 与 debug seed 属 design 阶段测试基础设施，不阻断三审通过。
