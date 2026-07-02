# 前端技术方案 · REQ-2026-001 · v1

- **作者**：frontend-design
- **时间**：2026-07-02T18:15+08:00
- **消费契约**：[api-contract.v1.md](./api-contract.v1.md)（对齐后由 backend-design 置 `frozen: true`）

## 0. 消费/反馈

对契约 §11 待确认点的立场：

1. `auth:hello.preferredVersion` 保留 → **同意**，减少一次 fetch
2. `room:list` 不含大厅聊天字段 → **同意**
3. `chat message` 暂无 `type` 字段 → **同意**，未来加系统消息再扩
4. Refresh 5 秒竞态窗口不暴露 → **同意**

**结论**：前端 v1 方案对契约 v1 无异议，请 backend-design 置 `frozen: true`。

## 1. 落点

```
client/src/
├── components/wps/
│   ├── LoginDialog.tsx              ← 新增（登录 / 注册 tab）
│   ├── ChangePasswordDialog.tsx     ← 新增
│   ├── LobbyChatPanel.tsx           ← 新增（大厅频道）
│   ├── VersionMenu.tsx              ← 新增（Ribbon 内下拉）
│   ├── ChatPanel.tsx                ← 复用（保留房间频道）
│   ├── RoomListGrid.tsx             ← 扩展（增列 + 右侧聊天插槽 + 未登录只读）
│   ├── SpreadsheetGrid.module.css   ← 扩展（bgColorToken CSS 变量）
│   ├── Ribbon.tsx                   ← 扩展（版本按钮插槽）
│   ├── InfoBar.tsx                  ← 扩展（显示登录邮箱 + 下拉：改密/登出）
│   └── FormulaBar.tsx               ← 扩展（/version 命令）
├── store/
│   ├── appStore.ts                  ← 扩展 authState / capabilities / currentVersion
│   ├── authSlice.ts                 ← 新增（可作为 store 内 slice 或独立）
│   └── chatSlice.ts                 ← 新增（区分 lobby / room 频道）
├── api/                             ← 新增目录
│   ├── http.ts                      ← fetch 封装 + 自动 refresh on 401
│   ├── auth.ts                      ← register/login/logout/changePassword/refresh/me
│   └── capabilities.ts
└── data/
    └── errorMessages.ts             ← 契约错误码 → 中文提示映射
```

## 2. 状态机

### 2.1 authState

```
              refresh 成功
   loading ──────────────────┐
      │                      ▼
      │                    authed
      │                      │  logout / auth:invalidated
      │                      ▼
      └──── me 401 ────► guest
                             │  login / register 成功
                             ▼
                           authed
```

- 首屏挂载：`GET /api/capabilities` + `GET /api/auth/me` 并发
- 401 触发 `POST /api/auth/refresh` 一次；失败则 → `guest`

### 2.2 chatChannel 状态

- `null` → 未订阅任何频道
- `'lobby'` → 只订阅 `lobby:chat:*`；进大厅时切
- `roomCode` → 只订阅房间 `chat:*`；进房间时切
- 切换时清空对方消息缓存

## 3. 组件轮廓

- **LoginDialog**：单文件，两个 tab（登录 / 注册），提交后走 `api/auth`；关闭后仍显示房间列表只读视图。
- **LobbyChatPanel**：进入 mount 时先 `lobby:chat:snapshot`，再订阅 `lobby:chat:message`；输入框由公式栏兼职，未登录时 placeholder = `登录后可发送消息`。
- **VersionMenu**：Ribbon 内下拉，从 `capabilities.versions` 渲染；选中即 emit `version:switch`；命令 `/version <id>` 走同一 store action。
- **SpreadsheetGrid 填满**：ResizeObserver + rAF debounce 计算可用列数/行数，超出数据的位置渲染空 `<div>` 占位；`bgColorToken` 从 CSS 变量读，供 QA 抓取。

## 4. 事件消费

订阅 & 派发映射（引用契约事件名）：

| 契约事件 | 前端动作 |
|---|---|
| `auth:hello` | 更新 `authState` + `preferredVersion` |
| `auth:invalidated` | 清空 authState，弹提示"账号已在其他设备下线/改密"，跳登录 |
| `version:switched` | 更新 `currentVersion`；重拉 `room:list` |
| `lobby:chat:message` | append 到 `chatSlice.lobbyMessages`；去重按 `id` |
| `chat:message` | append 到 `chatSlice.roomMessages` |
| `room:list` ack | 覆盖 `roomListSlice` |
| `room:state` | 沿用现有逻辑 |
| `room:error` | 按 `code` 查 `errorMessages.ts` 展示 |

- **幂等/乱序**：消息 slice 用 `Map<id, msg>` + 排序 view；断线重连后重发 `snapshot` 会重合，靠 id 去重。

## 5. UX / 交互

- 未登录首屏：房间列表 sheet 可见（只读），中央出现登录对话框（Esc 可关，但顶部保留"登录"胶囊按钮再次唤起）
- 登录成功：InfoBar 显示 `已登录 xxx@qq.com`；点击展开下拉：`修改密码 / 登出`
- 大厅聊天头部：`聊天区（大厅）` + 在线人数（未登录不显示在线人数，避免暴露）
- 版本切换：Ribbon 下拉高亮当前版本；切换后 toast 提示 `已切换至 <name>`
- 老板键 `Ctrl+Shift+H`：聊天区隐藏；再次按显示

## 6. 兼容

- i18n：本期只 zh-CN，文案统一走 `data/errorMessages.ts` + 组件常量；预留 i18n key 但不接 lib
- 移动端：不支持，视口 < 1024px 显示"请在电脑访问" 空态
- A11y：登录对话框内 Tab 顺序 = 邮箱 → 密码 → 提交 → 切 tab；Enter 提交；Esc 关

## 7. 风险与备选

| 风险 | 备选 |
|---|---|
| ResizeObserver + rAF 的填满算法在低端机抖动 | 加节流 60ms + will-change: transform 稳态 |
| socket 断线时 chat 消息丢失 | 断线重连后重跑 snapshot，靠 id 去重补齐 |
| 401 → refresh → 重试 死循环 | 单次 refresh 攻略；再 401 直接跳登录 |
| 大厅频道进房间后仍收到消息 | store action 在切频道时先 unsubscribe |

## 8. 待 backend-task 对齐

- capabilities 端点稳定性：前端启动只 fetch 一次；如后端变更 versions 需要 socket 广播 `capabilities:changed`（本期不做，重连时重取）
- room:list 分页：本期一次全量返回 ≤ 50 条；超过 50 的处理放后续需求
