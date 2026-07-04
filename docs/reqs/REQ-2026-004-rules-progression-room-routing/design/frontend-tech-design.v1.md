# 前端技术方案 · REQ-2026-004 · v1

- **作者**：frontend-design
- **时间**：2026-07-04T13:35+08:00
- **消费 PRD**：[prd.v1.md](../prd/prd.v1.md)
- **消费契约**：[api-contract.v1.md](./api-contract.v1.md)

## 1. 落点

```
client/src/
├── App.tsx                         ← 三个一级 Sheet 的路由壳
├── store/appStore.ts               ← room / version / lifecycle / auth 状态
├── components/wps/SheetTabs.tsx    ← 一级 Sheet 选择
├── components/wps/Ribbon.tsx       ← 按 Sheet 切上下文动作
├── components/wps/RoomListGrid.tsx  ← 房间列表与版本入口
├── components/wps/GameGrid.tsx     ← current room 主面板
├── components/wps/VersionDetailDialog.tsx ← 只读版本详情
├── components/wps/PlayerProfileDialog.tsx ← 玩家公开资料
├── components/wps/LobbySalesGrid.tsx ← 区域销售伪装页
└── utils/display.ts                ← 玩家昵称 / 日志主体区分
```

## 2. 页面壳

### 2.1 一级 Sheet

- `房间列表`
- `当前房间`
- `区域销售`

### 2.2 切换规则

- `SheetTabs` 只切一级入口，不再依赖旧 `sheet1/sheet2/game` 语义。
- `当前房间` 在未进房时隐藏或置灰均可，但路由态必须保留。
- 刷新恢复后，依据 `room:state.status` 自动落到正确 Sheet。

## 3. Ribbon 上下文

- `房间列表`：创建/加入/返回/版本详情。
- `当前房间`：准备、开始、离开、选将、结算相关动作。
- `区域销售`：只保留伪装表格相关动作。
- Ribbon 不再从全局状态猜测按钮，必须消费当前 Sheet 上下文。

## 4. 房间状态展示

### 4.1 `waiting`

- 直接展示房间基础信息、座位、准备状态和聊天。

### 4.2 `selecting`

- 选将面板占主区域。
- 当前玩家显示候选卡；其他玩家显示等待文案与已选结果。
- 倒计时由 `deadlineAt` 驱动。

### 4.3 `playing`

- 进入现有对局画面。
- 受 `roomLifecycle` 影响时只显示状态提示，不引入第二套本地判定。

### 4.4 `finished`

- 结算摘要展示后自动回到 `waiting` 视图。

## 5. 页面状态恢复

- `sessionStorage.roomContext` 记录 `roomCode`、`activeSheet`、`enteredAt`。
- 启动时并发拉 `capabilities` 与 `auth/me`，再决定是否 `room:join`。
- 若 `room:state` 与 `activeSheet` 冲突，以房间真实状态为准。

## 6. 版本详情与资料弹窗

- 版本详情只读弹窗展示中文名、人数范围、武将、卡牌目录和开放门槛。
- 玩家公开资料弹窗展示昵称、财富、等级、战绩，不展示邮箱或账号标识。

## 7. 文案与展示

- 房间列表版本列统一显示中文名。
- 房间内玩家名显示 `[房主]昵称` / `昵称`。
- 日志主体优先武将名。

## 8. 成长经济

- `R-PROG-*` 仅保留文档标记，不做 UI 入口。

## 9. 验收映射

| AC | 前端要点 |
|---|---|
| AC-SHEET-01~03 | 一级 Sheet、Ribbon 上下文切换 |
| AC-ROOM-01~05 | 房间循环、退出、托管、2-8 人限制 |
| AC-RULE-01~05 | 版本详情 / 规则文案展示 |
| AC-UI-01~04 | 玩家、角色、版本中文名 |
| AC-PROG-01 | 仅保留，不出 UI |

