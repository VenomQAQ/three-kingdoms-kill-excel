# 后端可行性评审 · REQ-2026-003 · v1

- **评审员**：backend-feasibility
- **时间**：2026-07-03T17:35+08:00
- **判定**：**pass-with-conditions** ⚠️
- **消费 PRD**：[prd/prd.v1.md](../prd/prd.v1.md)

## 1. 归属与影响面

| 模块 | 变更类型 | 关联需求 |
|---|---|---|
| `server/src/modules/room/room.service.ts` | **大改** | 选将阶段机；移除开局 `assignRandomGenerals`；rejoin 增强 |
| `server/src/gateway/game.gateway.ts` | 扩展 | `room:rejoin`、`general:select`、昵称广播 |
| `server/src/modules/auth/auth.service.ts` | 扩展 | R-ACCT-02 改昵称；R-ACCT-03 注册校验 |
| `server/src/modules/game/game.service.ts` | 扩展 | 选将完成后才 `engine.start()` |
| `packages/engine/src/resolution/card-play-service.ts` | **修复** | R-ENG-01 无懈→continueResolution 断链 |
| `packages/engine/src/core/identity.ts` | 扩展 | 选将池管理（从 assignRandomGenerals 拆出） |
| `packages/shared/src/index.ts` | 扩展 | `RoomStatus` 增 `selecting`；选将相关事件 |

影响面：**大改**（房间生命周期 + 引擎结算修复）。

## 2. 状态 & 一致性

| 主题 | 分析 |
|---|---|
| 选将阶段 | 需在 `startGame` 与 `engine.start()` 之间插入 `selecting`；引擎实例延至选将完成后创建 |
| 武将池 | 内存维护「本局已选武将」集合；主公 5/他人 3 从剩余池 sample，无持久化 |
| 刷新重进 | 现有 `ReconnectService` + `rebindUserPlayer` 可复用；需保证 `selecting` 阶段重连仍能看到当前 prompt |
| 改昵称 | 更新 DB + 内存 room 玩家 nickname + 广播；无跨局一致性要求 |
| 无懈断链 | 纯引擎状态机 bug；`submitWuxieResponse(pass)` → `promptNextWuxie` 空队列时应调 `continueResolution`，疑为 `scheduleAoe` 标志未传递 |

## 3. 事件时序

**新增/扩展 socket 事件（约 4–6 条）**

| 方向 | 事件（工作名） | 用途 |
|---|---|---|
| C→S | `room:rejoin` `{ code }` | 刷新后静默回房（可与 join 合并） |
| C→S | `general:select` `{ generalId }` | 提交选将 |
| S→C | `general:prompt` | 下发候选列表 + 倒计时 |
| S→C | `user:nicknameChanged` | 昵称变更广播 |
| S→C | `room:state` | 扩展 `status=selecting` |

**锦囊修复**：无新事件；修复后 `room:state` 的 prompt 正常推进。

## 4. 性能 / 安全

| 项 | 要求 |
|---|---|
| 选将超时 | 每房间 1 个 60s 计时器；选完清除；房间解散时清理 |
| 改昵称限流 | 1 次/分钟/账号，内存 sliding window |
| 并发选将 | 房间级锁；仅当前座次玩家可 `general:select` |
| 作弊 | 客户端不可提交未在候选列表的 generalId |

## 5. 成本 & 风险

- **粗估**：**6–9 人日**
  - 选将阶段机 + gateway：3–4 人日
  - 引擎无懈断链 + 7 项锦囊排查：2–3 人日
  - 改昵称 + rejoin 增强：1–2 人日

- **Top 3 风险**
  1. `startGame` 当前同步创建 engine 并 `start()`，拆阶段需理顺 `room.sandbox` 与 engine 生命周期
  2. 测试房 sandbox 是否也走选将——PRD 未明确；建议正式房走选将，sandbox 保持快速加人+可选将（避免阻塞 AI 测试）
  3. 无懈→AOE 断链可能涉及 `continueResolution` 与 `TargetQueue` 多处入口，需引擎单测覆盖

- **与前端对齐**
  - `room.status` 枚举扩展
  - 选将 prompt payload 结构
  - 房间列表如何标识「本人所在房间」（`room:list` 增 `isMember` 或客户端用 roomCode 匹配）

## 6. 条件（pass-with-conditions）

1. PRD 需明确**测试房（sandbox）是否进入选将阶段**——建议：sandbox 可选将（房主开始后同样流程），或保留手动 `sandbox:addPlayer` 指定武将作为快捷路径；默认与正式房一致。
2. `room:rejoin` 与 `room:join` 建议合并：同 userId + code 命中保坐即 rebind，减少 gateway 分支（design 定稿）。
3. 选将超时默认选「候选列表第一张」需在 PRD 固定顺序（按服务端下发数组下标 0），避免争议。

## 7. 引擎缺陷初步定位（R-ENG-01）

阅读 `card-play-service.ts`：`submitWuxieResponse(choiceId='pass')` → `promptNextWuxie` 在队列空时调 `continueResolution`。南蛮场景下 `continueResolution` 应返回 `{ scheduleAoe: true }` 并由上层调度 TargetQueue——疑为上层 `confirmPlay` / `submitResponse` 未处理 `scheduleAoe` 返回值。修复范围在 engine + server game.service 回调链，**后端可控**。

## 8. 判定

**pass-with-conditions** ⚠️：模块边界清晰，现有 RoomService/GameService 可扩展；选将阶段插入点明确。sandbox 选将策略待 PRD 补一句后即可进入 ③。
