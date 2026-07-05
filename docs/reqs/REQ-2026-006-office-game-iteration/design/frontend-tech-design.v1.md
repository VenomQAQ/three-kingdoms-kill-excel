# 前端技术设计 v1

## 1. 模块改动

| 文件 | 改动 |
| --- | --- |
| `App.tsx` | 增加设置弹窗、账号详情入口、游戏类型创建、大富翁视图路由 |
| `appStore.ts` | `createRoom(gameType)`、monopoly socket actions、room list 支持 gameType |
| `InfoBar.tsx` | 展示 Lv/昵称/金币/在线状态，昵称点击打开资料 |
| `Ribbon.tsx` | “粘贴”改“设置”，暴露 `onOpenSettings` |
| `SettingsDialog.tsx` | 新增设置弹窗，承载改昵称/改密/标题设置 |
| `SheetTabs.tsx` | 右键菜单与 localStorage label map |
| `PlayerProfileModal.tsx` | 战绩 tab 化，读取 `statsByGame` |
| `RoomListGrid.tsx` | 增加类型列和创建类型选择配套展示 |
| `MonopolyGrid.tsx` | 新增 Excel 风格世界版大富翁棋盘 |

## 2. 状态设计

- `sheetLabels` 不进全局 store，`SheetTabs` 内部从 `localStorage.tk_sheet_labels_v1` 读取和保存。
- 浏览器标题使用 `localStorage.tk_browser_title`，设置后立即 `document.title = title`。
- 大富翁操作通过 store socket action 发出，不在前端自行判定资产结算。

## 3. 视觉与性能

- 大富翁棋盘采用固定单元格和 CSS grid，不引入 canvas，便于测试与 WPS 表格一致性。
- 连连看继续使用现有 filler，单元格尺寸保持稳定。
- 弹窗复用 `GameModal.module.css`，避免卡片嵌套。

