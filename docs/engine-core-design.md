# 三国杀通用引擎核心设计

> 目标：**不为每个武将/每张牌写 `if (skillId)`**；新内容 = 配置 + 原子效果 +（必要时）复用**交互模式 Handler**。

## 1. 三层架构

```
┌─────────────────────────────────────────────────────────┐
│  SangokushiEngine（编排）                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ GameState   │  │ TurnPhaseFSM │  │ ResolutionStack │ │
│  │ 唯一真相源   │  │ 回合阶段流转  │  │ LIFO 嵌套结算    │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│         ▲                  │                    │         │
│         │                  └────────┬───────────┘         │
│         │                           ▼                     │
│         │              ┌────────────────────────┐         │
│         └──────────────│ RuleManager（规则层）   │         │
│                        │ · 配置 → RuleDefinition│         │
│                        │ · pre/on/post 监听     │         │
│                        │ · 原子效果 + 交互 Handler│         │
│                        └────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

| 层 | 职责 | 禁止 |
|----|------|------|
| **GameState** | 玩家、牌堆、回合索引、`prompt`、`resolution` 上下文；`toJSON()` / `restore()` | 不含结算逻辑 |
| **Event / Resolution** | 动作 → `GameEvent` → 入栈 → `resolveEvent`（pre → on → execute → post） | 不读武将 id 分支 |
| **RuleManager** | 按 `timing × phase × priority` 收集规则并执行 | 不按 `cao_cao` 分支 |

**遗留 `GameEngine`**：M2 过渡实现；新功能只加在 `SangokushiEngine` 与 `packages/engine/src/core/*`。

---

## 2. 结算模型：堆栈 + 目标序

三国杀同时需要两种队列：

| 结构 | 顺序 | 用途 |
|------|------|------|
| **ResolutionStack** | LIFO（后发先至） | 无懈叠无懈、伤害中插入濒死、嵌套响应 |
| **TargetQueue** | FIFO（逆时针固定） | 万箭/南蛮逐人询问 |

### 2.1 事件四段式（对应 Pre / On / Post）

```typescript
async resolveEvent(event: GameEvent): Promise<void> {
  await ruleManager.emit(event, 'pre');    // 无懈、改判、防止伤害
  if (event.cancelled) return;

  await ruleManager.emit(event, 'on');     // 出闪、即时转化、受到伤害时
  if (event.cancelled) return;

  await executeCore(event);                // 扣血、摸牌、移动牌（原子）

  await ruleManager.emit(event, 'post');   // 奸雄、反馈、天妒、遗计
}
```

`GameTiming` 与 **phase** 组合表达图 1：

| 图 1 | phase | 典型 GameTiming |
|------|-------|-----------------|
| 最高 Pre | `pre` | `BEFORE_CARD_USED`, `BEFORE_DAMAGE`, `BEFORE_JUDGE` |
| 高 On | `on` | 响应窗口、`DAMAGE`（正在结算） |
| 低 Post | `post` | `AFTER_DAMAGE`, `AFTER_JUDGE`, `CARD_USED`, `TURN_END` |

### 2.2 AOE 流程（万箭齐发）

```
push UseCardEvent(万箭)
  → pre: 全局无懈窗口（可 push 子事件，先结算子栈顶）
  → schedule TargetQueue [p1, p2, ...] 逆时针
  → for each target:
       push TargetResolveEvent(target)
         → pre: 对该角色的无懈
         → on:  出闪
         → execute: 未响应 → push DamageEvent(1)
         → post: 遗计、刚烈…
  → pop 继续下一目标
```

---

## 3. 配置化：技能 / 牌 / 装备统一为 Rule

### 3.1 RuleDefinition（运行时注册项）

```typescript
interface RuleDefinition {
  id: string;                    // 唯一，如 skill:jianxiong
  source: { type: 'skill' | 'equipment' | 'card'; id: string };
  timing: GameTiming;
  phase: 'pre' | 'on' | 'post';
  priority: number;              // 越大越先（同 phase 内）
  conditions?: ConditionSpec[];  // 谓词链，全部满足才触发
  effects?: EffectDefinition[];  // 原子效果列表
  handler?: string;              // 可选：交互模式名，非武将名
}
```

启动时 `ConfigRuleLoader` 从 `CharacterRegistry` + `CardRegistry` 扁平化所有技能/装备被动，**不写死在引擎里**。

### 3.2 条件：谓词注册表（禁止 eval）

```typescript
// 配置
conditions: [{ predicate: 'hpAtMost', params: { n: 2 } }]

// 注册
conditionRegistry.register('hpAtMost', (ctx, p) => ctx.target.hp <= p.n);
```

### 3.3 效果：原子原语（~15 个）

见 `EffectExecutor` + `docs/architecture.md` §4.5。复杂效果 = **多个原子** 或 **一个 handler 名**。

### 3.4 交互 Handler：按模式，不按武将

| handler | 说明 | 配置示例技能 |
|---------|------|----------------|
| `stealHands` | 少摸 N + 选目标各抢 1 手 | 突袭 |
| `revealAndTake` | 亮顶 N 张按类型入手 | 裸衣、恂恂 |
| `judgeLoop` | 判定循环直到条件失败 | 洛神 |
| `giveAndChoose` | 给牌 + 目标二选一 | 反间、离间 |
| `distributeCards` | 将手牌分给多名角色 | 遗计、仁德 |
| `modifyJudge` | 打出一张牌改判 | 鬼才 |

**新武将**：JSON 里 `handler: "stealHands"` + `params`，不新增 TS 文件。

---

## 4. 装备 = 持续 Rule

装备在 `EQUIP` 时注册规则，卸下时注销：

```json
{
  "id": "zhuge_liannu",
  "rules": [
    {
      "timing": "PHASE_PLAY_START",
      "phase": "post",
      "effects": [{ "action": "modifyRule", "params": { "rule": "shaPerTurn", "value": null } }]
    }
  ]
}
```

`RuleModifier` 在 `CALC_DISTANCE`、`ON_DAMAGE_CALC` 等时机合并（攻击范围、+1/-1 马、无双响应次数等）。

---

## 5. GameState 与 Prompt

```typescript
interface GameState {
  turn: { index: number; round: number; phase: TurnPhase };
  players: PlayerState[];
  deck: DeckState;
  discardPile: string[];
  prompt: GamePrompt | null;       // UI 暂停点（见 PromptType）
  resolution: {
    stack: GameEvent[];            // 待结算栈（栈顶 = 当前）
    targetQueue: string[] | null;  // AOE 目标序
    context: Record<string, unknown>; // cardPlay、zonePick、pendingReactive 等
  };
  modifiers: RuleModifier[];       // 距离、出杀上限等
  log: string[];
}
```

**濒死**：`DYING` 事件 `priority: MAX`，`stack.pushFront(dyingEvent)`，结算完再 `resume` 原事件。

**循环保护**：`MAX_STACK_DEPTH = 255`。

---

## 6. 目录结构（目标）

```
packages/engine/src/
├── core/
│   └── sangokushi-engine.ts      # 编排入口
├── state/
│   ├── game-state.ts
│   └── rule-modifiers.ts
├── resolution/
│   ├── resolution-stack.ts
│   ├── target-queue.ts
│   └── event-resolver.ts
├── rules/
│   ├── rule-manager.ts
│   ├── config-rule-loader.ts
│   ├── condition-registry.ts
│   ├── effect-executor.ts
│   └── interaction-registry.ts
├── fsm/
│   └── turn-phase-machine.ts
├── config/                       # 静态配置（不变）
├── registry/
└── engine/
    └── game-engine.ts            # 遗留，逐步迁移
```

---

## 7. 与「零定制」的关系

| 说法 | 是否成立 |
|------|----------|
| 不为张辽/郭嘉各写 `initiateSkill` 分支 | ✅ 目标 |
| 引擎核心永不改 | ❌ 新**交互模式**偶尔加 Handler |
| 70%+ 牌/技能仅 JSON + 原子 | ✅ |
| 用 `eval(effect)` 配技能 | ❌ 用谓词 + 原子 + handler |

---

## 8. 迁移路线

1. ✅ 本设计 + `SangokushiEngine` / `RuleManager` / `EventResolver` 骨架
2. ✅ 【杀】→闪→伤害→`AFTER_DAMAGE`（仅受害者触发技能）
3. ✅ 过河拆桥/顺手牵羊 → `select_zone_card` + 手牌匿名
4. 🚧 AOE 改为 `TargetQueue` + 每目标 `TargetResolveEvent` 完整接线
5. 🚧 `ConfigRuleLoader` 全量注册 30 将；删除 `game-engine` 武将分支
6. 🔲 实现 6 个交互 Handler；配置补全 `handler` 字段

详见 [engine-implementation.md](./engine-implementation.md)。
