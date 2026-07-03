# 需求档案库（docs/reqs）

每个需求一个目录：`REQ-YYYY-NNN-短标题-kebab/`。所有 agent 的产物**只写进自己的子目录**，禁止跨目录改文件。

## 当前活跃需求

| REQ | 阶段 | 说明 |
|---|---|---|
| [REQ-2026-001-wps-account-version](./REQ-2026-001-wps-account-version/INDEX.md) | ①已定稿 | 账号/大厅/单元格填满 |
| [REQ-2026-002-game-core-m3](./REQ-2026-002-game-core-m3/INDEX.md) | ③开发中 | M3 锦囊/正式房大厅 |
| **[REQ-2026-003-ux-gameplay-polish](./REQ-2026-003-ux-gameplay-polish/INDEX.md)** | **②已通过** | **本轮 SSOT：UX + 选将 + 引擎修复** |

## 目录约定

```
docs/reqs/
├── README.md                       ← 本文档
├── _health/                        ← lifecycle-keeper 巡检报告
└── REQ-2026-001-wps-account-version/
    ├── INDEX.md                    ← 本需求的目录索引 + 版本变更日志
    ├── lifecycle.yaml              ← 当前阶段/状态点（唯一，orchestrator 维护）
    ├── prd/
    │   ├── prd.v1.md
    │   └── prd.v2.md               ← 打回后新版本
    ├── review/
    │   ├── review-signoff.v1.yaml  ← 三维会签聚合（②）
    │   ├── frontend-feasibility.v1.md
    │   ├── backend-feasibility.v1.md
    │   ├── qa-testability.v1.md
    │   └── integration-signoff.v1.yaml  ← 联调双签（③）
    ├── design/
    │   ├── backend-tech-design.v1.md
    │   ├── api-contract.v1.md      ← SSOT
    │   └── frontend-tech-design.v1.md
    ├── tasks/
    │   ├── backend-tasks.v1.yaml
    │   └── frontend-tasks.v1.yaml
    ├── code-review/
    │   ├── backend.v1.md
    │   └── frontend.v1.md
    └── qa/
        ├── test-plan.v1.md
        ├── test-cases.v1.yaml
        └── test-report.v1.md
```

## 版本约定

- 所有可能被打回重来的产物**都带 `.vN` 后缀**：`prd.v1.md`、`review-signoff.v1.yaml`。
- **只追加，不覆盖**：新版本另建 `.v2`，老版本保留只读作历史证据。
- `INDEX.md` 顶部列"当前生效版本"，其它都是历史。
- 相互引用统一写"当前版本"：例如 `design/api-contract.md` 是软链接或 INDEX 指定，agent 读到"当前生效版"。
- `lifecycle.yaml` 只有一份、不带版本号；跃迁历史追加到内部 `history` 数组。

## 命名规则

- `REQ-ID`：`REQ-YYYY-NNN`（如 `REQ-2026-001`）。
- 目录名：`REQ-ID-短标题-kebab`（英文小写连字符），例：`REQ-2026-001-wps-account-version`。
- 版本号：`v1` 起递增；被打回后新增 `v2`，不改 `v1`。
- 时间戳：所有 signoff / review 内写 ISO8601 + 时区。

## 引用规则（跨 agent 只读）

- backend-design 生成的 `api-contract.vN.md` 是 SSOT，frontend-design/coder **只读不改**。
- code-reviewer 的必改清单会新建 review 的 `.v(N+1)`，不改 `.vN`。
- test-report 每轮测试新增 `.vN`，缺陷描述里必须指出 `ref_case` 与 `ref_task`。
