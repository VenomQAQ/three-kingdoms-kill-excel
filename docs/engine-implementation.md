# 卡牌引擎实现说明（M2+）

> **配置驱动核心设计**（推荐新功能遵循）：[engine-core-design.md](./engine-core-design.md)  
> 新入口：`SangokushiEngine` — 不为每个武将写分支。

## 包结构

```
packages/engine/
├── src/core/
│   ├── sangokushi-engine.ts   # 编排入口 ★
│   └── turn-runner.ts         # 回合阶段、弃牌、改判
├── src/state/                 # GameState、RuleModifier
├── src/resolution/
│   ├── resolution-stack.ts
│   ├── target-queue.ts
│   ├── event-resolver.ts      # pre → on → execute → post
│   ├── card-play-service.ts   # 用牌、响应、选区域牌
│   ├── card-play-context.ts
│   └── skill-play-service.ts
├── src/rules/
│   ├── rule-manager.ts        # ConfigRuleLoader 规则执行
│   ├── effect-executor.ts
│   ├── condition-registry.ts
│   └── interaction-registry.ts
├── src/fsm/turn-phase-machine.ts
├── src/config/
│   ├── cards/                 # basic.ts, trick.ts, equipment.ts
│   ├── characters/            # wei/shu/wu/qun.ts
│   └── deck.ts
├── src/registry/
├── src/engine/
│   ├── zone-card-pick.ts      # 过河拆桥/顺手牵羊选牌
│   ├── effect-runner.ts
│   ├── targeting.ts
│   └── game-engine.ts         # 遗留，逐步迁移
└── src/index.ts               # 导出 @tk/engine
```

## 架构概览

| 层 | 职责 |
|----|------|
| **TurnPhaseMachine** | `judge → before_draw → draw → play → discard → end` |
| **ResolutionStack** | LIFO 嵌套结算（伤害、濒死、响应） |
| **EventResolver** | `pre → on → execute → post`，`TAKE_DAMAGE` 后 `AFTER_DAMAGE` 技能 |
| **RuleManager** | `ConfigRuleLoader` 注册技能 Rule；受伤后仅询问**受害者** |
| **CardPlayService** | 读 `CardDefinition` 驱动用牌；`promptResponse` / 即时效果 / 选区域牌 |
| **GamePrompt** | 暂停 UI，客户端 `GamePromptModal` 回传选择 |

### 杀 → 闪 → 伤害 → 反馈 流程

```
CardPlayService.startResolution(杀)
  → promptResponse(闪)
  → pass → applyDamage → push TAKE_DAMAGE
  → EventResolver.execute: 扣血
  → post: RuleManager.emitForPlayersWithSkills(AFTER_DAMAGE, victimId only)
  → prompt use_skill（反馈/奸雄等）
```

## 武将数据（30 将）

与 `docs/cards/characters.md` 对齐，按势力拆分：

| 文件 | 数量 | 代表武将 |
|------|------|----------|
| `wei.ts` | 8 | 曹操、司马懿、夏侯惇、张辽、许褚、郭嘉、甄姬、李典 |
| `shu.ts` | 8 | 刘备、关羽、张飞、诸葛亮、赵云、马超、黄月英、徐庶 |
| `wu.ts` | 8 | 孙权、甘宁、吕蒙、黄盖、周瑜、大乔、陆逊、孙尚香 |
| `qun.ts` | 6 | 华佗、吕布、貂蝉、华雄、袁术、公孙瓒 |

### 已接线技能/机制（SangokushiEngine）

| 能力 | 实现位置 |
|------|----------|
| 无双（双闪/双杀） | `timing-runner.applyLockedModifiers` |
| 咆哮（杀无次数限制） | `CardPlayService.canUseShaThisTurn` |
| 英姿（多摸牌/手牌上限） | `TurnRunner` |
| 马术 / 义从 | `targeting.distanceBetween` |
| 仁德 / 制衡 / 鬼才 | `SkillPlayService` + 专用 prompt |
| 奸雄 / 反馈 | `RuleManager` + `AFTER_DAMAGE` + `EffectExecutor.moveCard` |
| 过河拆桥 / 顺手牵羊 | `select_zone_card` prompt + `zone-card-pick.ts` |
| 仁王盾 / 青釭剑 | `shaBlockedByArmor` / `sourceIgnoresArmor` |

## Prompt 类型

| type | 触发 |
|------|------|
| `play_card_confirm` | 出牌确认 |
| `select_targets` | 需选目标的锦囊/杀 |
| `response` | 出闪/杀响应 |
| `select_zone_card` | 过河拆桥、顺手牵羊 |
| `discard_cards` | 弃牌阶段 |
| `modify_judge` | 鬼才改判 |
| `use_skill` | 主动/被动技能询问、仁德给牌等 |

## 选区域牌（zone-card-pick）

- 配置识别：`discard` + `zone: any` → 弃置；`moveCard` 无 `from` → 获得
- `listZoneCards()`：手牌匿名标签 + Fisher-Yates 打乱；装备明牌
- `choiceId` 格式：`hand:0` / `equipment:1`（真实数组下标，非展示序号）
- 回调 `host.log` 须用箭头函数绑定，避免 `this.state` 丢失

## 断线重连（服务端）

- `RoomService.joinSandboxRoom`：按昵称匹配 `!connected` 的非虚拟玩家
- `SangokushiEngine.remapPlayerId(oldId, newId)`：迁移 prompt、cardPlay、zonePick、栈事件等
- `GameService.syncRoomFromEngine` 重连后刷新 room.sandbox

## 迁移状态

| 能力 | GameEngine（遗留） | SangokushiEngine |
|------|-------------------|------------------|
| 回合 FSM | ✅ | ✅ TurnRunner |
| 杀/闪/伤害/奸雄/反馈 | ✅ 硬编码 | ✅ CardPlayService + TAKE_DAMAGE 栈 |
| 过河拆桥/顺手牵羊 | 自动随机弃/拿 | ✅ 玩家选区域牌 |
| AOE | ✅ 硬编码 | 🚧 TargetQueue 部分接线 |
| 技能配置加载 | 部分 | ✅ ConfigRuleLoader → RuleManager |
| 武将 if 分支 | rende/zhiheng 等 | ❌ 禁止（走 Rule + Handler） |

## 客户端

- `GamePromptModal`：全部 prompt 类型 UI
- `CharacterSkillModal`：表格「技能」列点击查看
- `room.sandbox.prompt` 经 `GameService.syncRoomFromEngine` 同步
- `prompt.playerId` 与 `turnIndex` 变化时自动 `sandboxSwitchActor`

## 扩展指南

1. **新武将**：`config/characters/{势力}.ts` → `character()` + `timings`/`effects`
2. **新牌**：`config/cards/*.ts` → `effects[]` 原语；需选牌则扩展 `getZonePickAction`
3. **新交互模式**：`InteractionRegistry.register(handlerName, fn)`，配置写 `handler: 'xxx'`
4. **新 Prompt**：扩展 `PromptType`（shared + engine）→ `GamePromptModal` → Gateway 事件
