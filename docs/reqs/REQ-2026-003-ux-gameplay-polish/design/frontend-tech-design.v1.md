# 前端技术方案 · REQ-2026-003 · v1

- **作者**：frontend-design
- **时间**：2026-07-03T18:45+08:00
- **消费 PRD**：[prd.v2.md](../prd/prd.v2.md)
- **消费契约**：[api-contract.v1.md](./api-contract.v1.md)

## 1. 落点

```
client/src/
├── App.tsx                         ← sessionStorage 恢复 room:join、activeSheet 恢复
├── store/appStore.ts               ← room:join 返回态、selecting 状态、nickname 同步
├── components/wps/RoomListGrid.tsx ← 本人房间高亮、状态列「选将中」、加入/返回文案
├── components/wps/GameGrid.tsx     ← waiting/selecting/playing 分流
├── components/wps/GeneralSelectPanel.tsx ← 新增正式房选将面板
├── components/wps/LoginDialog.tsx  ← 注册确认密码
├── components/wps/ChatPanel.tsx    ← 房间聊天底部输入框
├── components/wps/Ribbon.tsx       ← 修改昵称入口
└── utils/display.ts                ← 拆分 nickname 展示与 game log 武将名展示
```

## 2. 刷新恢复与返回房间

- 进入正式房后写入 `sessionStorage.roomContext = { roomCode, activeSheet, enteredAt }`。
- 页面启动完成 auth hydrate 与 socket 连接后，如存在 roomCode，直接 emit `room:join`。
- `room:join` 返回 `room:state` 后：
  - `waiting` → 显示 LobbyGrid
  - `selecting` → 显示 GeneralSelectPanel
  - `playing` → 显示 BattleGrid
- 房间列表本人所在行高亮，操作文案显示「返回」，点击仍调用 `room:join`。

## 3. 正式房选将 UI

`GeneralSelectPanel` 行为：

- 仅在 `room.status === 'selecting'` 时显示。
- 当前玩家收到 `generalSelection.myOptions` 时展示候选卡；其他玩家显示「等待 XXX 选将」。
- 候选卡字段：武将名、体力/血量、技能名、技能摘要。
- 显示倒计时，默认从 `deadlineAt` 计算；倒计时结束后等待服务端自动选择结果，不做客户端本地提交。
- 点击候选卡后启用「确认」；确认发送 `general:select { roomCode, generalId, _v: 1 }`。
- 已选武将列表对所有人可见，身份隐藏规则不变。

## 4. 测试房隔离

- sandbox 页面与快捷入口继续沿用现有自定义角色/武将流程。
- 不因为服务端支持正式房 `selecting` 就把 sandbox 强制切到 GeneralSelectPanel。
- 测试房仍可通过原有模拟开局快速进入规则测试。

## 5. 昵称、日志与账号表单

- 首页、房间列表、聊天、大厅表格、状态栏显示 nickname。
- 登录、注册、改密等账号表单允许显示 QQ 邮箱。
- 对局动作日志渲染优先使用服务端 `text`；若本地格式化，使用 `actorGeneralName` 为主体，必要时附 `actorNickname`。
- `display.ts` 拆为两个语义：
  - `formatPlayerName(player)`：昵称优先，用于玩家身份展示。
  - `formatGameLogActor(entry)`：武将名优先，用于动作日志。

## 6. 注册、昵称与聊天输入

- 注册 tab 增加确认密码字段；不一致时前端内联提示「两次密码不一致」，不发请求。
- Ribbon 账号菜单增加「修改昵称」入口；成功后等待 `user:nicknameChanged` 与 `room:state` 同步。
- 房间 ChatPanel 底部固定单行输入 + 发送按钮；Enter 发送，空内容不发送，长度沿用 200。

## 7. 对局区铺满

- `LobbyGrid`、`GeneralSelectPanel`、`BattleGrid` 都纳入 game-sheet 填满策略。
- 继续使用 REQ-001 的背景色 token / data attr 供像素脚本读取。
- 对局侧栏展开/折叠态都需稳定布局，避免候选卡或聊天输入框撑破网格。

## 8. 验收映射

| AC | 前端要点 |
|---|---|
| AC-UX-01~04 | sessionStorage + `room:join` + 三态恢复 |
| AC-GAME-01~03 | selecting 面板、候选卡字段、倒计时、提交选择 |
| AC-SBX-01 | sandbox 原 UI/自定义角色流程保留 |
| AC-ACCT-01~04 | nickname 展示、日志武将名、注册确认密码 |
| AC-CHAT-01 | 房间聊天输入框 |
| AC-UI-01 | 等待/选将/对局 Sheet 铺满 |
