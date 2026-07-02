# 前端可行性评审 · REQ-2026-001 · v1

- **评审员**：frontend-feasibility
- **时间**：2026-07-02T16:00+08:00
- **判定**：**pass-with-conditions** ⚠️

## 1. 归属与影响面

主要落在 `client/src/components/wps/*` 与 `client/src/store/appStore.ts`：

- **新增**：`LoginDialog`（登录 / 注册双 tab）、`ChangePasswordDialog`、`LobbyChatPanel`、Ribbon 的 `VersionButton`。
- **扩展**：`RoomListGrid` 增加"版本"列 + 右侧聊天区插槽；`SpreadsheetGrid` 空单元格自适应逻辑；`FormulaBar` 支持 `/version`。
- **改动**：`appStore` 引入 `authState` 与 `currentVersion` 分片；`App.tsx` 在未登录时装载登录对话框 → 阻塞进入房间/发言。
- **不动**：对局面板 `GameGrid`、`BattleGrid`、GamePromptModal 等战斗流程。

影响面归类：**扩展 + 新增**（非大改）。

## 2. 交互复杂度

**M**（Medium）。

关注点：

- 大厅聊天 & 房间聊天频道切换要清晰（同一 `ChatPanel` 组件复用？还是拆两个？倾向拆，避免逻辑纠缠）。
- 登录对话框在 WPS 外壳内呈现，需要挡住表格交互但不遮住 Ribbon / 状态栏（沿用 Excel "数据校验" 风格）。
- 单元格填满是"数值 UI 契约"：resize / 缩放 / 打开-收起聊天区时都要重算网格数量。

## 3. 实时性 & 网络

- 需要新 socket 事件量级：**约 3–5 条**（登录 ack、大厅聊天 pub/sub、版本切换广播、房间列表按版本过滤）。
- 断线重连：登录 session 若走 Cookie，socket 认证走 handshake header；建议后端在 gateway 中间件里做，前端不动。

## 4. 性能 / 兼容风险

- 单元格填满：resize 每帧重算风险 → 需 debounce + ResizeObserver（现状实现方式待 design 阶段确认）。
- 移动端 / 触控：本期 PRD 未明确要求移动端，若不支持要在 PRD §6 声明。
- A11y：登录对话框 tab 序列 + Esc/Enter 已在 PRD 说明，可承接。

## 5. 成本 & 风险

- 粗估成本：**3–5 人日**。
- Top 3 风险：
  1. 单元格填满在含聊天区、Ribbon 折叠、老板键切表时的边界一致性容易做出"1px 缝隙"，回归成本高。
  2. 大厅频道 / 房间频道切换若共用一个组件，容易泄漏消息或错发频道。
  3. 版本切换持久化到账号——若后端 design 用"账号偏好"字段，前端要处理登录后回填。
- 强依赖后端：
  - 登录 session 机制（Cookie vs JWT）
  - `roomList` 事件要能按 version 过滤
  - 大厅频道是"独立事件类型"还是"房间号 = lobby 的复用"，需要后端定型

## 6. 通过条件（PRD 需补齐）

1. 明确 sandbox 房 `/sandbox` 是否要求登录（PRD §5 说"保留"，但没说是否强制登录才能进）。**建议**：登录后才能进，避免绕过账号系统。
2. 明确"未登录能看多少东西"：能否看到房间列表？能否看到大厅聊天？**建议**：登录页阻塞，其它一律看不到。
3. R-2 单元格填满的验收 KPI（"空白像素 ≤ 3%"）——需要一个可复现的测量方法（QA 会拉一版脚本）；PRD 需承认此判据由 QA 用截图 diff 校验。
4. 版本切换的入口冲突：Ribbon 加按钮 vs 公式栏命令 → design 阶段选一为主，一为辅。

## 7. 判定

`pass-with-conditions`：条件均为"PRD 层可澄清"，不涉及技术不可行，产品补齐后即可放行。
