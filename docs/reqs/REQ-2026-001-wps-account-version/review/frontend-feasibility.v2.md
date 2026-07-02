# 前端可行性复核 · REQ-2026-001 · v2

- **评审员**：frontend-feasibility
- **时间**：2026-07-02T17:30+08:00
- **判定**：**pass** ✅
- **v1 参考**：[frontend-feasibility.v1.md](./frontend-feasibility.v1.md)

## 1. 复核范围

对 v1 提出的 4 条条件在 v2 的落实情况逐条核对：

| v1 条件 | 是否消解 | v2 落点 | 备注 |
|---|---|---|---|
| sandbox 是否强制登录 | ✅ | §4.8 | 开启时也需登录，前端不需要额外分支 |
| 未登录可见范围 | ✅ | §4.7 | 明确"房间列表 + 大厅只读"，前端 auth-gate 逻辑清晰 |
| R-2 3% 判据 | ✅ | §4.6 | 三档分辨率 + 非背景色像素占比 → QA 侧可脚本化，前端可自测 |
| 版本切换入口 | ✅ | §4.3 | Ribbon 主 + `/version` 辅，无冲突 |

## 2. 新增/修订项对前端的影响

- **§4.7 未登录只读**：前端在 `appStore.authState` 增 `guest` 分支；`RoomListGrid` 需接收 `readonly` 属性；发言 / 加入 / 创建 / 版本切换按钮变灰或不渲染。工作量约 +0.5 人日。
- **§4.2 auth:invalidated 广播**：全局 socket 监听器捕获事件后清空 `authState`、跳回登录对话框，其它标签页要能同步（通过 socket 广播，不依赖 storage）。工作量 +0.5 人日。
- **§4.4 大厅聊天首拉 100 条**：`LobbyChatPanel` 挂载时先 fetch snapshot 再订阅实时；需处理"snapshot 空缺 vs 已收到的实时消息去重"。工作量已在原估内。
- **§4.6 三档分辨率基线**：前端需要在 dev tools 三档下自检；`SpreadsheetGrid` 的空单元格填充算法应与视口 resize 联动（ResizeObserver + rAF debounce）。工作量已在原估内。
- **§4.8 sandbox 环境开关**：前端读取后端返回的 `capabilities`（含 `sandboxEnabled: boolean`），据此渲染入口。工作量 +0.2 人日。

## 3. 依赖后端确认（不阻断复核）

- `capabilities` 端点（含 `sandboxEnabled` + `versions[]`）由后端提供，供前端在启动时读取。
- `auth:invalidated` 事件名及 payload 待 `backend-design` 在契约里定死。
- `lobby:chat:snapshot` 与 `lobby:chat:message` 事件名/顺序保证由 backend-design 定。

## 4. 更新后的成本 & 风险

- 更新后粗估：**3.5–5.5 人日**（v1 3–5，新增净 +0.5 至 +0.8）。
- 风险变动：
  - Top 1 风险维持在 R-2 视觉一致性；但 v2 明确了三档分辨率与判据，风险可控。
  - 新增"标签页同步失效"风险：可通过 socket 广播实现，不引入 storage 依赖。

## 5. 判定

**pass** ✅：v1 提出的 4 条 PRD 层条件均已在 v2 落点清晰、判据可测；未引入新的技术不可行点。可进入 `②已通过`。
