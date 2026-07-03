# 前端可行性评审 · REQ-2026-003 · v1

- **评审员**：frontend-feasibility
- **时间**：2026-07-03T17:35+08:00
- **判定**：**pass-with-conditions** ⚠️
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 归属与影响面

| 模块 | 变更类型 | 关联需求 |
|---|---|---|
| `client/src/App.tsx` | 扩展 | R-UX-01 sessionStorage 恢复 activeSheet；房间列表高亮 |
| `client/src/store/appStore.ts` | 扩展 | 自动 rejoin、昵称同步、`user:nicknameChanged` |
| `client/src/components/wps/LoginDialog.tsx` | 扩展 | R-ACCT-03 确认密码 |
| `client/src/components/wps/ChatPanel.tsx` | 扩展 | R-CHAT-01 底部输入框 |
| `client/src/components/wps/RoomListGrid.tsx` | 扩展 | R-UX-02「返回」行、本人高亮 |
| `client/src/components/wps/LobbyGrid.tsx` / `BattleGrid.tsx` | 扩展 | R-UI-01 铺满；R-GAME 选将 UI |
| `client/src/components/wps/GeneralSelectPanel.tsx` | **新增** | R-GAME-01/02 选将面板 |
| `client/src/utils/display.ts` | 修改 | R-ACCT-01 昵称优先展示 |
| `client/src/components/wps/Ribbon.tsx` | 扩展 | 改昵称入口 |

影响面：**大改**（新增选将阶段 UI + 刷新恢复链路）。

## 2. 交互复杂度

| 需求 | 复杂度 | 说明 |
|---|---|---|
| R-UX-01/02 | M | 刷新恢复与 Sheet 状态机耦合；需处理 hydrate 与 socket 竞态 |
| R-ACCT-01~03 | S | 表单字段与展示层调整 |
| R-ENG-01/02 | — | 纯引擎，前端仅回归 |
| R-UI-01 | M | BattleGrid 折叠态/展开态双基线；ResizeObserver 已有可复用 |
| R-GAME-01/02 | **L** | 新阶段 UI + 等待他人选将 + 超时展示 |
| R-CHAT-01 | S | 复用 LobbyChatPanel 输入区模式 |

综合复杂度：**L**（选将阶段为主因）。

## 3. 实时性 & 网络

- **新增 socket 依赖（量级）**：
  - `room:rejoin` 或复用 `room:join`（1 条）
  - `general:options` / `general:select` / `general:phaseChanged`（约 2–3 条，design 定名）
  - `user:nicknameChanged`（1 条）
- **断线重连**：现有 `game:sync` + `applyRoomState` 可扩展；选将 prompt 需随 `room:state` 下发。
- **刷新恢复**：sessionStorage 仅存 roomCode，状态以服务端为准，可行。

## 4. 性能 / 兼容风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 选将面板阻塞对局区渲染 | 低 | 选将 UI 用 overlay，不卸载 SpreadsheetGrid |
| sessionStorage 隐私模式不可用 | 低 | 降级为手动「返回」房间（PRD 已声明） |
| 昵称全局替换遗漏点 | 中 | grep `email` / `formatGeneralName` 全量排查 |
| 对局区 3% 像素在侧栏折叠态失败 | 中 | 双套 QA 基线 |

## 5. 成本 & 风险

- **粗估**：**5–8 人日**
  - 选将 UI + 阶段切换：2–3 人日
  - 刷新/重进：1–1.5 人日
  - 昵称/注册/聊天输入：1 人日
  - 对局区铺满：1–1.5 人日
  - 联调回归：1 人日

- **Top 3 风险**
  1. 选将阶段与现有 `room.status` 枚举冲突，需与后端对齐
  2. `App.tsx` 已有较多 `useEffect`，自动 rejoin 与 guest 登录弹窗可能竞态
  3. `formatGeneralName` 广泛引用，改昵称展示易漏

- **依赖后端**
  - 选将阶段状态机与候选武将列表下发
  - `room:join` 保坐重绑行为
  - 改昵称 API + socket 广播

## 6. 条件（pass-with-conditions）

1. backend-design 明确 `selecting` 阶段字段放在 `room.status` 还是 `sandbox.phase`（前端倾向 `room.status='selecting'` 单枚举，判断简单）。
2. 选将候选武将列表由服务端下发（含 id/name/maxHp/skills 摘要），前端不自行 shuffle。
3. PRD §4.2 昵称展示格式 `昵称（武将）` 对对局日志是否强制——建议日志用昵称，武将名单独列，避免 `display.ts` 双重语义。

## 7. 判定

**pass-with-conditions** ⚠️：现有 Vue/React 组件体系可承接；选将阶段为最大增量，风险可控。待 §6 条件在 design 契约中消解后可进入 ③。
