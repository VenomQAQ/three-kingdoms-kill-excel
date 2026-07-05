# 前端可行性评审 · REQ-2026-005 · v1

- **评审角色**：frontend-feasibility
- **结论**：pass-with-questions
- **时间**：2026-07-05
- **输入**：[PRD v1](../prd/prd.v1.md)

## 1. 总体判断

前端可实现。现有客户端已经有 WPS 风格表格组件、Sheet 标签、聊天面板、账号状态、金币/等级字段、武将名展示清洗工具与战场侧栏结构。本轮主要风险在于战场铺满要从固定列宽升级为动态 filler、连连看 Sheet 要避免做成独立游戏页，以及玩家资料弹窗需要稳定的数据入口。

## 2. 可复用现状

| 能力 | 现状 | 复用方式 |
|---|---|---|
| Sheet 标签 | `SheetTabs.tsx` + `decoy.ts` | 增加 `lianliankan` SheetId |
| WPS 表格 | `SpreadsheetGrid.module.css` | 复用 row/header/cell/filler 样式 |
| 武将名清洗 | `utils/display.ts` | 扩展覆盖更多文本入口 |
| 聊天 UI | `ChatPanel` / `LobbyChatPanel` | 增加时间格式化展示 |
| 账号信息 | `AuthUser` 已有 `coins/level` | 传入 `TitleBar` 或 `InfoBar` 展示 |
| 金币变化 | `user:walletChanged` | 连连看扣奖后复用刷新 |

## 3. 关键实现建议

### 3.1 去“界”

- 保留 `stripGeneralPrefix` 与 `stripGeneralPrefixInText`，但需要集中审计所有展示入口。
- 建议在 `sanitizeRoom`、角色选项、日志、prompt、连连看三国主题 item 展示层统一处理。

### 3.2 聊天时间

- 新增 `formatChatTime(timestamp)`。
- `ChatPanel`、`LobbyChatPanel`、`BattleGrid` 内部聊天列表统一展示时间。
- 样式建议：时间置于昵称前或同一行右侧，保持 12px 表格感。

### 3.3 玩家信息弹窗

- 新增 `PlayerProfileModal`。
- 点击昵称时以 `userId/playerId` 请求资料；当前房间内玩家可先传 nickname 做 loading 占位。
- 战场用户列由普通 cell 改为 button-like cell，但视觉仍像单元格文本链接。

### 3.4 顶部账号信息

- `TitleBar` 增加可选 `accountLabel` 或将展示放入 `InfoBar` 右侧。
- PRD 指定右上角，建议落在 `TitleBar` 最右侧替代/靠近“共享”按钮。

### 3.5 战场折叠与铺满

- 当前 `BattleGrid` 同时存在 `collapsedHandle` 与 `collapseToggle`，需收敛成单一入口。
- `boardLayout.sideCollapsed` 改为 `grid-template-columns: minmax(0, 1fr) 32px`，折叠窄条作为 grid 第二列，不再渲染隐藏的 `aside`。
- 使用 `ResizeObserver` 或现有 `useCellFiller` 动态计算 filler 行列。

### 3.6 连连看 Sheet

- 新增 `LianliankanGrid.tsx`，保持 `wrap/corner/colHeaders/body/row/cell` 结构。
- 顶部控制不做卡片，可以作为表格前 2-3 行或公式栏下方的小工具条。
- 棋盘区域建议带外圈空白哨兵格，便于两折路径算法。

## 4. 风险与疑问

| 编号 | 问题 | 影响 | 建议 |
|---|---|---|---|
| FE-Q1 | 玩家资料接口返回字段未定 | 弹窗无法稳定实现 | 后端设计明确 `GET /api/users/:id/profile` |
| FE-Q2 | 连连看结算若只前端判断易作弊 | 金币奖励风险 | 前端负责交互，后端负责扣奖与幂等 |
| FE-Q3 | “右上角”究竟在 TitleBar 还是 InfoBar | UI 位置可能返工 | 产品 v2 固化到 TitleBar 右侧 |
| FE-Q4 | 战绩 userId 与 room playerId 是否一致 | 点击资料可能查不到人 | 后端需在 `RoomPlayer` 暴露稳定 `userId` 或保证 `id` 可查 |

## 5. 结论

通过，但要求 PRD v2 消解 FE-Q1~FE-Q4，尤其是玩家资料数据契约、顶部展示位置与连连看金币权威边界。

