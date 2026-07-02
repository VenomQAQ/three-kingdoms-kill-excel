# QA 可测性复核 · REQ-2026-001 · v2

- **评审员**：qa-testability
- **时间**：2026-07-02T17:30+08:00
- **判定**：**pass** ✅
- **v1 参考**：[qa-testability.v1.md](./qa-testability.v1.md)

## 1. 复核范围

对 v1 提出的 4 条条件在 v2 的落实情况：

| v1 条件 | 是否消解 | v2 落点 | 备注 |
|---|---|---|---|
| R-1 视觉基线授权 | ✅ | §4.6 | 明确授权 QA 建立 `qa/baseline/*.png`，随需求档案入库 |
| R-2 3% 判据 | ✅ | §4.6 | "非背景色像素 / 视口面积"，可脚本化；分辨率三档 |
| R-4 session TTL / 重连时限 | ✅ | §5.2 | Access 1h / Refresh 7d / 断线 5min，全部数值化 |
| R-8 聊天节流 + 历史 | ✅ | §4.4 | 1000/100/1条秒/200字，均可写为断言 |

## 2. 逐条需求点复核

| 需求点 | v2 可测 | 备注 |
|---|---|---|
| R-1 | 可测 | 视觉基线 + 截图 diff（Playwright + pixelmatch） |
| R-2 | 可测 | 三档分辨率 + 像素比例断言；容差需 design 期与前端对齐（建议 ±0.3%） |
| R-3 | 可测 | 邮箱正则、密码强度、重复注册（含大小写归一）、限流 |
| R-4 | 可测 | 双 token 用例：过期刷新、旋转旧 token 失效、5min 保坐、超过 5min 掉座 |
| R-5 | 可测 | 改密后旧 access 立即失效 / refresh 立即失效 / 广播事件到其它 socket |
| R-6 | 可测 | 版本目录只有 `standard-2014` 时不显示切换列表（或显示为唯一项） |
| R-7 | 可测 | 满员被拒 + 错误码 `E_ROOM_FULL`；换版本后创建的房间容量正确 |
| R-8 | 可测 | 滚动窗口截断（写入 1001 条后最老一条消失）；快照返回 100 条；限流命中 `E_CHAT_RATE_LIMIT`；长度命中 `E_CHAT_TOO_LONG` |
| R-9 | 可测 | 未登录只读：能收 `room:list` / `lobby:chat:message`，但发聊天/加房/切版本均返回 `E_UNAUTHORIZED` |

## 3. 新增测试基础设施需求（design 阶段准备）

- **视觉基线**：`qa/baseline/{1440x900,1920x1080,2560x1440}/*.png`；每次回归 diff 阈值 ≤ 0.5%（像素差异总量占比），非背景色像素占比断言 ≤ 3%。
- **像素扫描脚本**：Playwright + canvas 采样；背景色 token 由前端在 `data-attr` 或全局 CSS 变量暴露，QA 读取该 token 作为判据依据。
- **时间旅行**：session TTL 用例需要能"快进 1 小时 / 7 天"，建议后端提供一个 dev-only 的 `debug:advanceClock` 事件，或在测试环境注入 mock clock。若不允许，用真实等待 → CI 会跑很久，建议采纳。
- **SQLite fixture**：测试前 seed 用户表 + 聊天历史；用 in-memory SQLite 加速。

## 4. 判定

**pass** ✅：全部需求点均可测，判据已数值化；仅需在 design 阶段协调"mock clock / capabilities 端点 / 背景色 token 暴露"三项测试基础设施，属常规工作，不阻断复核。

## 5. 遗留提请

- 请 `backend-design` 在契约中提供 dev-only 的时间快进接口（或提供在测试环境注入 mock clock 的机制），否则 R-4 的 refresh 过期用例无法在合理时间内跑完。
