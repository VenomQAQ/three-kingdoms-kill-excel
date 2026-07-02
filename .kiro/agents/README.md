# 三国杀 · 全流程多代理协作说明

本目录定义一整套"从需求 → 评审 → 开发 → 测试 → 预上线"的 Agent 角色和协作规则，
对齐 **5 阶段状态机**：①产品设计 → ②评审会签 → ③开发 → ④测试 → ⑤预上线（人工验收）。

## 目录结构

```
.kiro/agents/
├── README.md                       ← 本文档：状态机 + 会签规则 + 共享看板
├── prd-author.md                   ← ①产品设计
├── frontend-feasibility.md         ← ②评审会签（前端）
├── backend-feasibility.md          ← ②评审会签（后端）
├── qa-testability.md               ← ②评审会签（QA 可测性）
├── backend-design.md               ← ③开发（后端：API 契约 SSOT）
├── backend-task.md                 ← ③开发（后端：任务拆解）
├── backend-coder.md                ← ③开发（后端：编码）
├── backend-unit-tester.md          ← ③开发（后端：单测）
├── backend-code-reviewer.md        ← ③开发（后端：代码评审）
├── frontend-design.md              ← ③开发（前端：消费契约/技术方案）
├── frontend-task.md                ← ③开发（前端：任务拆解）
├── frontend-coder.md               ← ③开发（前端：编码）
├── frontend-code-reviewer.md       ← ③开发（前端：代码评审）
├── qa-test-designer.md             ← ④测试（用例/计划）
├── qa-tester.md                    ← ④测试（执行/判缺陷）
├── lifecycle-orchestrator.md       ← shared：横向驱动流转
└── lifecycle-keeper.md             ← shared：横向巡检 & 一致性报告
```

## 5 阶段状态机

| 阶段 | 状态点 | 进入条件 | 出口条件 | 出口人 |
| --- | --- | --- | --- | --- |
| ① 产品设计 | `①已定稿` | 新需求进入 | PRD 通过产品维度自检（清晰/完整/价值/优先级） | prd-author |
| ② 评审会签 | `②已通过` | ①已定稿 | 前端 ✓ + 后端 ✓ + QA ✓ 三维全签 | 最后一签者翻牌 |
| ③ 开发 | `③已完成` | ②已通过 | 后端 code-reviewer ✓ + 前端 code-reviewer ✓ + 前后端联调 ✓ | 最后一签者翻牌 |
| ④ 测试 | `④已通过` | ③已完成 | qa-tester 执行全部用例通过 | qa-tester |
| ⑤ 预上线 | `⑤上线` | ④已通过 | 人工验收，agent 不代翻 | 用户本人 |

**回退规则：**

- ②任一 ✗ → 回 ①，交回 `prd-author`
- ③ code-review 未过 → 回 `*-coder`
- ④ 发现缺陷 → 回 ③ 交给对应 `*-coder` 修复，修复完重新走当前 code-reviewer

## 共享看板（Single Source of Truth）

所有 agent 只读/只写下列文件通信，禁止各自记忆状态：

```
docs/reqs/<REQ-ID>/
├── prd.md                         ← 产品维度产物，prd-author 负责
├── review-signoff.yaml            ← ②三维签核聚合表
├── api-contract.md                ← ③ backend-design 输出，前端只读
├── backend-tech-design.md         ← ③ backend-design 输出
├── backend-tasks.yaml             ← ③ backend-task 拆解
├── frontend-tech-design.md        ← ③ frontend-design 输出
├── frontend-tasks.yaml            ← ③ frontend-task 拆解
├── code-review/
│   ├── backend.md                 ← backend-code-reviewer 输出
│   └── frontend.md                ← frontend-code-reviewer 输出
├── integration-signoff.yaml       ← 联调签核（前/后各一次）
├── qa/
│   ├── test-plan.md               ← qa-test-designer 输出
│   ├── test-cases.yaml            ← 用例清单
│   └── test-report.md             ← qa-tester 执行结果
└── lifecycle.yaml                 ← 当前阶段/状态点，由 orchestrator 维护
```

## 签核聚合表格式（示例）

`review-signoff.yaml`：

```yaml
req_id: REQ-2026-001
stage: "②评审会签"
signoffs:
  frontend-feasibility: { status: pending, verdict: "", reviewer: "", ts: "" }
  backend-feasibility:  { status: pending, verdict: "", reviewer: "", ts: "" }
  qa-testability:       { status: pending, verdict: "", reviewer: "", ts: "" }
result: pending      # pass / reject / pending
last_signer: ""      # 翻牌者
```

`integration-signoff.yaml`：

```yaml
req_id: REQ-2026-001
stage: "③开发-联调"
signoffs:
  frontend: { status: pending, verdict: "", reviewer: "" }
  backend:  { status: pending, verdict: "", reviewer: "" }
result: pending
```

## 领域约定（三国杀）

以下规则对所有 agent 生效：

- 出牌流程：`出牌阶段 → 目标合法性 → 结算队列 → 响应窗口（无懈可击/闪等）→ 伤害/摸弃牌 → 判定`
- 技能生效：区分「主动」「触发（时机）」「锁定」「限定」；触发时机需明确 `beforeDamage / onDamage / afterDamage / drawPhase` 等
- 牌类型：基本牌 / 锦囊（普通、延时）/ 装备（武器、防具、坐骑±1）
- 测试重点：技能优先级、多目标顺序、连锁触发死循环、装备互斥
- 服务端权威：任何客户端提示都需服务端二次校验，前端不直接改战斗状态

## 通用工作准则

1. 只做自己那一段：产品不写代码、评审不动实现、coder 不改 PRD。越界前必须回退到上游 agent。
2. 一切留痕：所有产物写入 `docs/reqs/<REQ-ID>/`，不要只在对话里输出。
3. 可回滚：修改共享看板使用 patch 式追加，禁止整段覆盖历史结论。
4. 中文优先：产物、评审意见、commit message 使用中文。
5. 状态更新走 orchestrator：任何阶段跃迁只由 `lifecycle-orchestrator` 写 `lifecycle.yaml`，其他 agent 只提出跃迁建议。
