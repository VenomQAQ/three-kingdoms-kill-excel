# 前端可行性复核 · REQ-2026-004 · v1

- **评审员**：frontend-feasibility
- **时间**：2026-07-04T11:50+08:00
- **判定**：**pass-with-conditions**
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 归属与影响面

- 主要落点：`client/src/App.tsx`、`client/src/components/wps/Ribbon.tsx`、`SheetTabs.tsx`、`RoomListGrid.tsx`、`GameGrid.tsx`、`InfoBar.tsx`、`FormulaBar.tsx`。
- 影响面：**大改**。这不是简单加一个面板，而是把 Sheet 作为一级入口重新分层。

## 2. 交互复杂度

- Sheet 初始三入口、Ribbon 随 Sheet 切换、房间状态循环、版本详情弹窗、玩家公开资料弹窗都在同一套桌面壳里发生。
- 复杂度：**L**。

## 3. 实时性与网络

- 不需要新增数量很多的 socket 事件，但需要把现有房间状态、版本详情和玩家信息的展示上下文拆清。
- 断线重连可沿用现有 room 恢复路径，但要保证 Sheet 恢复和 room 恢复不是彼此打架。

## 4. 性能 / 兼容风险

- 主要风险是页面状态切换后的重复渲染、Sheet 隐藏与显示的布局抖动、以及旧的 `sheet1/sheet2/game` 习惯路径继续残留。
- `standard-2014` 版本人数上限若改成 2-8，会牵动房间创建、房间列表提示和 `capabilities` 展示。

## 5. 成本 & 风险

- 粗估成本：**3-5 人日**。
- Top 3 风险：
  1. Sheet 一级入口和现有三层路由继续混用，导致 UI 状态分叉。
  2. 版本详情弹窗和房间列表的入口边界不清，造成功能入口重复。
  3. 房间结束回等待与聊天保留如果没有统一状态源，前端容易出现“看起来回房了但状态没回”的假象。
- 强依赖后端：版本上限、房间状态、玩家资料接口的稳定语义。

## 6. 结论

**pass-with-conditions**：前端能承接，但 `sheet1/sheet2/game` 到“三个一级 Sheet”的迁移必须先由设计明确页面壳结构，不能继续在现有入口上叠加临时判断。

