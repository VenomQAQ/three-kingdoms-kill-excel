# 前端代码评审 · REQ-2026-001 · v1 · 第 1 轮

- **评审员**：frontend-code-reviewer
- **时间**：2026-07-03T15:05+08:00
- **审阅范围**：FE-3 ~ FE-11（`client/src` 账号/版本/大厅聊天实现）
- **参考**：`design/api-contract.v1.md`（frozen） / `design/frontend-tech-design.v1.md` / `tasks/frontend-tasks.v1.yaml`
- **构建**：`npm run build -w client` ✅（tsc + vite 全绿）

## 结论

- **verdict：changes-requested** ❌
- **blocking：2**
- **non-blocking：6**
- FE-3~11 主干交互已落地，build 通过；但存在 **2 项契约/正确性 blocking**，修完后再签联调
- 不建议当前版本直接走 integration signoff

## 维度打分

| # | 维度 | 结论 | 备注 |
|---|---|---|---|
| 1 | 契约一致性 | **risk** | 大厅聊天/版本切换/全局事件基本对齐；`room:list` 仍走 legacy REST |
| 2 | 工程落点 | **pass** | 组件/store/api/data 分层清晰；无组件裸调 fetch |
| 3 | 正确性 | **fail** | 版本切换乐观更新无失败回滚（blocking-1） |
| 4 | 类型安全 | **risk** | `appStore.ts` 8 处 `(socket as any)` 绕过共享事件类型 |
| 5 | UX / 交互 | **pass** | 登录/只读浏览/改密/大厅聊天/sandbox 门控符合 PRD 轮廓 |
| 6 | 错误处理 | **pass** | `errorMessages.ts` 覆盖契约 §0.4 全量枚举 |
| 7 | 可维护性 | **pass** | 中文注释齐、文件归位正确、改动范围聚焦 |
| 8 | 构建 | **pass** | `npm run build -w client` 全绿 |

## 必改（blocking）

### blocking-1 · 版本切换乐观更新，失败无回滚

**文件**：`client/src/App.tsx:296-308` · `client/src/store/appStore.ts:494-497`

```ts
// App.tsx — 选中即 toast 成功
setCurrentVersion(versionId);
showToast(`已切换至 ${name}`);
void fetchRoomList();

// appStore.ts — 本地先改，再 emit
setCurrentVersion: (versionId: string) => {
  set({ currentVersion: versionId });
  get().socket?.emit('version:switch' as any, { versionId, _v: 1 });
},
```

**问题**：

- `version:switch` 无 ack；服务端拒绝（`E_VERSION_UNKNOWN` / `E_UNAUTHORIZED`）时通过 `room:error` 返回
- 前端已 toast「已切换至 …」且 `currentVersion` 已改，**不会回滚**
- 用户可能同时看到成功 toast + 错误 toast；房间列表按错误版本过滤

**必改**：

- `setCurrentVersion` 仅 emit，不立即 `set`；等 `version:switched` 事件（已有监听）再更新 `currentVersion` + `fetchRoomList` + toast
- 或在 `room:error` 处理中检测版本域错误并回滚 `currentVersion`（需记录 pendingVersionId）
- toast 成功提示改到 `version:switched` 回调，与多 tab 同步逻辑一致

**违反**：`frontend-tech-design.v1.md` §4 事件消费 · `tasks/FE-5` acceptance「同账号多 tab 同步」

---

### blocking-2 · `fetchRoomList` 未对接契约 `room:list` socket

**文件**：`client/src/store/appStore.ts:199-213`

```ts
const res = await fetch('/rooms');
// ...
roomList: list.filter(
  (r) => r.isSandbox || (r.versionId ?? 'standard-2014') === currentVersion,
),
```

**问题**：

- frozen 契约 §6.1 要求 `socket.emit('room:list', { versionId?, _v:1 }, ack)`
- 当前走 legacy `GET /rooms`（全量返回 + **客户端** filter），与 FE-9 交付物「重拉 room:list」及 TC-G-001 步骤不符
- 服务端 `listPublicRooms(versionFilter?)` 已支持 filter，但 REST controller 未暴露 query param

**必改**（二选一，推荐 A）：

- **A.** 后端补齐 `room:list` socket handler 后，前端改为 socket ack，payload 带 `versionId: currentVersion`
- **B.** 短期：`GET /rooms?versionId=` 传参 + 去掉客户端 filter；同时在纪要标注契约偏离，走 CR

**注**：后端 gateway 目前亦无 `room:list` handler，需前后端联调一并补齐。

**违反**：`api-contract.v1.md` §6.1 · `tasks/FE-9` deliverable

## 建议（non-blocking）

### suggest-1 · `authState` 缺少 `refreshing` 态

**文件**：`client/src/store/appStore.ts:26`

design §2.1 状态机含 `'refreshing'`；`http.ts` 401→refresh 期间 UI 无法区分 loading vs refreshing。本期可延后。

### suggest-2 · 移动端空态未实现

**文件**：`client/src/App.tsx`

`frontend-tech-design.v1.md` §6 要求视口 < 1024px 显示「请在电脑访问」。当前无守卫。

### suggest-3 · `joinRoom` 无 `E_ROOM_VERSION_MISMATCH` 自动切版本重试

**文件**：`client/src/store/appStore.ts:246-277`

契约 §6.3 / TC-R-002 要求收到 mismatch 后本地切版本再重发。后端 `joinRoom` 亦未校验版本，联调 TC-R-002 会 fail——建议前后端同期补齐。

### suggest-4 · socket 新事件类型用 `as any` 绕过

**文件**：`client/src/store/appStore.ts`（8 处）

`auth:hello` / `auth:invalidated` / `version:switched` / `lobby:chat:*` 应扩 `@tk/shared` 事件类型，消除 `as any`。

### suggest-5 · 错误双通道展示

**文件**：`client/src/App.tsx:130-132` + `701-705`

`lastError` 同时触发 Toast 和内联 error bar，用户可能看到重复提示。建议统一走 Toast 或只保留一处。

### suggest-6 · 大厅消息长度用 UTF-16 计数

**文件**：`client/src/store/appStore.ts:418-421`

契约 §5.1 要求 Unicode 码点计数；`trimmed.length` 对 emoji 代理对可能与服务端不一致。建议用 `[...trimmed].length` 或 `Intl.Segmenter`。

## 逐任务验收清单（FE-3 ~ FE-11）

| 任务 | 结论 | 说明 |
|---|---|---|
| **FE-3** LoginDialog | ✅ pass | 登录/注册 tab、QQ 邮箱 hint（不阻塞提交）、Esc 关闭、loading+错误码映射、公式栏区 overlay 呈现 |
| **FE-4** ChangePasswordDialog + InfoBar | ✅ pass | InfoBar「已登录 email」+ 下拉改密/登出；改密成功 toast + 跳登录；`auth:invalidated` → `markUnauthenticated` 清 auth（其它 tab 可用） |
| **FE-5** Ribbon 版本 + /version | ⚠️ partial | VersionMenu 下拉高亮、`/version` 命令走同一 action；**blocking-1** 失败回滚缺失 |
| **FE-6** RoomListGrid 扩展 | ✅ pass | 版本列、guest 点击房间号提示登录、右侧 LobbyChatPanel 插槽、未登录操作门控 |
| **FE-7** LobbyChatPanel | ✅ pass | snapshot→subscribe、id 去重、guest 禁发、公式栏发聊天、200 字截断、进房 `unsubscribeLobbyChat` 清缓存 |
| **FE-8** 单元格填满 | ✅ pass（范围外确认） | RoomListGrid 已接 `useCellFiller` + `--bg-cell` token；本轮 scope 内无回归 |
| **FE-9** 全局 socket 事件 | ⚠️ partial | `auth:hello/invalidated/version:switched` 已监听；**blocking-2** `room:list` 仍 REST |
| **FE-10** errorMessages + Toast | ✅ pass | §0.4 全量枚举 + `translateError` 兜底；Toast 最小实现可用 |
| **FE-11** sandbox 门控 | ✅ pass | `capabilities.sandboxEnabled` 控制 Ribbon 按钮 + `/sandbox` 命令；`/nick` 保留为显示昵称 |

## 亮点

- **api 层规范**：`http.ts` 单飞 refresh + `credentials:'include'`，组件不裸调 fetch
- **chatSlice 去重**：`Map<id>` + 排序，snapshot 与推送重叠场景处理干净
- **guest 只读路径完整**：房间列表可见、操作统一 `requireAuth` + toast + 唤起 LoginDialog
- **sandbox 门控**：`sandboxEnabled ?? true` 默认值偏宽松，但门控逻辑位置正确（Ribbon + FormulaBar 双入口）

## 回归检查

- **构建**：`npm run build -w client` ✅
- **类型**：client tsc 全绿 ✅
- **未跑 e2e**：建议 QA 按 `qa/test-cases.v1.yaml` TC-C-* / TC-G-* / TC-A-* 走一轮后再签联调

## 建议 lifecycle

```yaml
suggestion:
  from: frontend-code-reviewer
  to: lifecycle-orchestrator
  verdict: changes-requested
  blocking_count: 2
  签: 联调前需修复 blocking-1、blocking-2
  integration_signoff: hold
```

### Integration signoff 摘要

| 项 | 状态 |
|---|---|
| verdict | **fail**（changes-requested） |
| blocking count | **2** |
| build | ✅ pass |
| 建议 | 修 blocking-1（版本切换回滚）+ blocking-2（room:list socket 或 CR 偏离方案）后进入联调；同步确认后端 `room:list` handler |
