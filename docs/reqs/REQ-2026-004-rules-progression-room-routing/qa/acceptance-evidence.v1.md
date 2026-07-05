# REQ-2026-004 验收证据 · v1

## 范围

- PRD 验收标准：`AC-SHEET-01~03`、`AC-ROOM-01~05`、`AC-RULE-01~05`、`AC-UI-01~04`。
- 延期范围：`R-PROG-01~04` 成长经济与签到奖励，仅保留入口与文档占位，不纳入本轮主验收。

## 验收映射

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AC-SHEET-01 | pass | `client/src/components/wps/req-2026-004-ui.spec.tsx` 验证底部仅渲染「房间列表」「当前房间」「区域销售」三个业务 Sheet；`SheetTabs.tsx` 固定 `ALL_SHEETS`。 |
| AC-SHEET-02 | pass | `req-2026-004-ui.spec.tsx` 验证房间列表 Ribbon 只出现创建/测试房入口，不出现「模拟开局」「添加角色」「打出」「结束回合」。 |
| AC-SHEET-03 | pass | `req-2026-004-ui.spec.tsx` 验证当前房间 Ribbon 出现离开/准备/开始等房间动作，且不出现创建房间动作；`App.tsx` 按 `activeSheet` 生成 `ribbonActions`。 |
| AC-ROOM-01 | pass | `server/src/modules/room/room.service.spec.ts` 覆盖 finished 后回到 waiting、保留座位并清空 ready；`RoomService.completeFinishedRoom` 写入结算记录。 |
| AC-ROOM-02 | pass | `room.service.spec.ts` 覆盖房主主动退出与断线后的房主轮转；无人时移除房间。 |
| AC-ROOM-03 | pass | `server/src/gateway/game.gateway.spec.ts` 覆盖 selecting/playing 主动离开扣 5 金币且最低为 0；`App.tsx` 在主动离开前弹出扣费确认。 |
| AC-ROOM-04 | pass | `room.service.spec.ts` 与 `game.gateway.spec.ts` 覆盖 disconnect 保座/托管、不扣金币、认证断线房主轮转。 |
| AC-ROOM-05 | pass | `packages/shared/src/versions.ts` 固定 `standard-2014` 为 2-8 人；`RoomService.createRoom/joinRoom/startGame` 消费版本人数上限；`room.service.spec.ts` 覆盖少于 2 人不可开始、8 人可入座、第 9 人被 `E_ROOM_FULL` 拒绝。 |
| AC-RULE-01 | pass | `packages/engine/src/resolution/card-play-service.spec.ts` 覆盖【过河拆桥】选择手牌/装备/判定区，且手牌选项匿名。 |
| AC-RULE-02 | pass | `packages/engine/src/core/turn-runner.spec.ts` 覆盖【闪电】未生效转移到下一名存活角色判定区，以及生效时造成雷电伤害且不转移。 |
| AC-RULE-03 | pass | `turn-runner.spec.ts` 覆盖界张飞【替身】准备阶段按上回合结束体力差回复并摸牌，且限定技不可重复发动。 |
| AC-RULE-04 | pass | `qa/standard-2014-skill-matrix.v1.md` 覆盖 30 将 55 技能，统计为 `55 full / 0 partial / 0 config`；引擎测试覆盖对应技能结算路径。 |
| AC-RULE-05 | pass | `packages/shared/src/versions.ts` 仅开放已完成矩阵的 `standard-2014`；`server/src/modules/capabilities/capabilities.controller.ts` 从版本目录输出 capabilities。 |
| AC-UI-01 | pass | `client/src/utils/display.ts` 的 `formatPlayerName` 输出 `[房主]用户昵称` 或 `用户昵称`。 |
| AC-UI-02 | pass | `client/src/utils/display.ts` 的 `formatCharacterLine` 输出 `势力-角色名【身份】`，并通过 `formatRoleName` 按 `roleRevealed` 暗置非主公身份。 |
| AC-UI-03 | pass | `req-2026-004-ui.spec.tsx` 验证技能详情中出现「玩家」且不出现「操控名」。 |
| AC-UI-04 | pass | `req-2026-004-ui.spec.tsx` 验证房间列表版本列显示「三国杀标准版·界限突破」。 |

## 本轮验证命令

```bash
npx vitest run client/src/components/wps/req-2026-004-ui.spec.tsx
npm run test -w @tk/engine
npx vitest run server/src/modules/room/room.service.spec.ts server/src/gateway/game.gateway.spec.ts server/src/modules/version/version-detail.service.spec.ts
npx vitest run
npm run build
```
