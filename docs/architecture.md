# 项目架构设计

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     PC Web Client (React)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ WPS Excel UI │  │ Game Canvas  │  │ Chat / Room Panel│  │
│  │  (伪装层)     │  │ (表格单元格)  │  │  (公式栏/侧边栏)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                  │                    │            │
│         └──────────────────┴────────────────────┘            │
│                            │                                 │
│                    WebSocket + REST                          │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                   NestJS Backend                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Gateway  │  │  Room    │  │  Game    │  │  Card       │  │
│  │ (WS)     │  │  Module  │  │  Engine  │  │  Registry   │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│         │              │              │              │       │
│         └──────────────┴──────────────┴──────────────┘       │
│                            │                                 │
│              ┌─────────────┴─────────────┐                   │
│              │  Redis (房间/会话/状态)     │                   │
│              └───────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈建议

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React + TypeScript + Vite | 组件化，表格 UI 可用 CSS Grid 模拟 |
| 状态 | Zustand / Jotai | 轻量，适合实时游戏状态 |
| 通信 | Socket.IO Client | 与 NestJS Gateway 对接 |
| 后端 | **NestJS** | 见下方评估 |
| 缓存/房间 | Redis | 房间状态、断线重连、Pub/Sub |
| 配置 | YAML / JSON | 卡牌、技能、效果定义 |
| 部署 | Docker Compose | 前后端 + Redis 一键启动 |

---

## 2. NestJS 后端评估

### 结论：**推荐使用 NestJS**

| 维度 | 评分 | 说明 |
|------|------|------|
| 实时通信 | ⭐⭐⭐⭐⭐ | `@nestjs/websockets` + Socket.IO 一等公民支持，Gateway 装饰器简洁 |
| 模块化 | ⭐⭐⭐⭐⭐ | Module/Provider 天然适合「房间 / 对局 / 卡牌效果」拆分 |
| 类型安全 | ⭐⭐⭐⭐⭐ | TypeScript 全栈，DTO + class-validator 校验入参 |
| 可测试性 | ⭐⭐⭐⭐ | 依赖注入便于 Mock GameEngine、CardRegistry |
| 扩展性 | ⭐⭐⭐⭐ | 后续加登录、战绩、AI 托管均可独立 Module |
| 学习成本 | ⭐⭐⭐ | 比 Express 重，但结构清晰，长期维护更省心 |
| 性能 | ⭐⭐⭐⭐ | 单房间状态在内存，Redis 做跨实例；10 人房间足够 |

### 适合本项目的理由

1. **WebSocket Gateway 模式** — 一个 `GameGateway` 处理 `joinRoom`、`playCard`、`useSkill`、`chat` 等事件，与 REST `RoomController`（创建房间、查询房间列表）职责分离清晰。

2. **依赖注入卡牌处理器** — 每张牌/每个技能注册为 `CardEffectHandler` / `SkillHandler`，引擎通过 Registry 查找，新增卡牌只需加配置 + Handler，不改核心循环。

3. **Guard / Interceptor** — 可统一做房间权限（是否在房间内）、操作合法性（是否轮到你）、频率限制（防刷聊天）。

4. **与 Redis 集成成熟** — `@nestjs-modules/ioredis` 或 `@liaoliaots/nestjs-redis`，房间号 → 房间状态映射、断线 TTL。

### 潜在注意点

| 问题 | 应对 |
|------|------|
| 游戏逻辑复杂，不宜全堆 Gateway | 独立 `GameEngine` 纯 TS 类，Gateway 只转发事件 |
| 多实例部署时 WS 粘性 | Redis Adapter for Socket.IO |
| 长时间对局内存 | 对局结束持久化 JSON 快照，活跃对局放 Redis |

### 备选方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **NestJS** | 结构清晰、WS 原生、适合中大型 | 样板代码略多 |
| Express + socket.io | 轻、自由 | 缺少模块边界，后期难维护 |
| Fastify + socket.io | 性能略好 | 生态与 Nest 比无显著优势 |
| Go (Gin + gorilla/websocket) | 高并发 | 与前端 TS 类型共享成本高 |

**推荐目录结构（NestJS）：**

```
server/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── gateway/
│   │   └── game.gateway.ts          # WebSocket 入口
│   ├── modules/
│   │   ├── room/
│   │   │   ├── room.module.ts
│   │   │   ├── room.service.ts      # 8 位房间号生成、加入/离开
│   │   │   └── room.controller.ts   # REST: POST /rooms
│   │   ├── game/
│   │   │   ├── game.module.ts
│   │   │   ├── game.service.ts      # 对局生命周期
│   │   │   └── game-engine/         # 纯逻辑，无 Nest 依赖
│   │   │       ├── engine.ts
│   │   │       ├── phase-runner.ts
│   │   │       └── event-bus.ts
│   │   ├── chat/
│   │   │   └── chat.service.ts
│   │   └── card/
│   │       ├── card.registry.ts     # 加载 YAML 配置
│   │       ├── handlers/            # 各牌/技能处理器
│   │       └── types/
│   └── config/
│       └── cards/                   # 卡牌 YAML（也可放 monorepo packages）
├── test/
└── package.json
```

---

## 3. 房间与在线多人设计

### 3.1 房间模型

```typescript
interface Room {
  id: string;              // 内部 UUID
  code: string;            // 8 位数字房间号，如 "48291037"
  hostId: string;          // 房主 socket userId
  maxPlayers: 10;
  players: RoomPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  gameId?: string;
  settings: RoomSettings;
  createdAt: number;
}

interface RoomPlayer {
  id: string;
  nickname: string;
  seat?: number;           // 1-10，开局后分配
  ready: boolean;
  connected: boolean;
}
```

### 3.2 房间号生成

- 格式：`10000000` ~ `99999999`（8 位，首位不为 0）
- 生成：`randomInt(10_000_000, 99_999_999)`，Redis `SETNX room:code:{code}` 防碰撞
- 碰撞重试：最多 5 次

### 3.3 WebSocket 事件（示例）

| 客户端 → 服务端 | 服务端 → 客户端 | 说明 |
|----------------|----------------|------|
| `room:create` | `room:created` | 创建房间，返回 code |
| `room:join` | `room:joined` / `room:error` | 凭 code 加入 |
| `room:leave` | `room:playerLeft` | 离开 |
| `room:ready` | `room:state` | 准备 |
| `room:start` | `game:started` | 房主开始（人数 2-10） |
| `chat:send` | `chat:message` | 房间聊天 |
| `game:action` | `game:state` / `game:event` | 出牌、技能、响应 |
| `game:sync` | `game:fullState` | 断线重连全量同步 |

### 3.4 聊天

- 范围：房间内所有玩家（含观战位，若后续支持）
- 频率限制：3 条/秒
- 存储：Redis List，最近 100 条，重连可拉取

---

## 4. 卡牌配置化与通用引擎设计

### 4.1 设计目标

- **数据驱动**：新卡牌/新技能 primarily 改 YAML，少改代码
- **统一生命周期**：所有效果挂接到同一套「时机 × 目标 × 结算」管道
- **可组合**：一张牌可触发多个 Effect；一个技能可监听多个 Timing
- **服务端权威**：所有随机、判定、伤害在服务端 `GameEngine` 执行

### 4.2 核心概念

```
CardDefinition (配置)
    ├── meta: id, name, type, suit, point, subType
    ├── targeting: 目标规则
    └── effects: EffectDefinition[]

SkillDefinition (配置)
    ├── meta: id, name, characterId, type (主动/锁定/限定/主公)
    ├── timings: 可触发的游戏时机
    └── effects: EffectDefinition[]

EffectDefinition (配置)
    ├── action: draw | discard | damage | recover | ...
    ├── params: { count, cardFilter, ... }
    └── conditions: 可选前置条件
```

### 4.3 游戏时机（Timing）枚举

三国杀所有技能/牌效果都可映射到「时机」：

```typescript
enum GameTiming {
  // 回合结构
  ROUND_START,
  TURN_START,
  PHASE_JUDGE,       // 判定阶段
  PHASE_DRAW,        // 摸牌阶段
  PHASE_PLAY,        // 出牌阶段
  PHASE_DISCARD,     // 弃牌阶段
  PHASE_END,         // 结束阶段
  TURN_END,

  // 事件类（可响应）
  BEFORE_CARD_USED,  // 使用牌时
  CARD_USED,         // 使用牌后
  BEFORE_DAMAGE,     // 受到伤害时
  DAMAGE,            // 造成伤害时
  DYING,             // 濒死
  DEATH,             // 死亡
  BEFORE_JUDGE,      // 判定牌生效前
  JUDGE,             // 判定
  CARD_DRAWN,        // 摸牌后
  CARD_DISCARDED,    // 弃置牌后
  EQUIP,             // 装备
  // ...
}
```

### 4.4 目标选择（Targeting）通用模型

```typescript
interface TargetRule {
  selector: 'self' | 'one' | 'all' | 'allOthers' | 'choose';
  count?: { min: number; max: number };
  filter?: TargetFilter;
  range?: RangeRule;
  canCancel?: boolean;  // 目标可否拒绝（如【乐不思蜀】不可）
}

interface TargetFilter {
  relation?: ('self' | 'enemy' | 'ally' | 'other')[];
  kingdom?: Kingdom[];           // 魏蜀吴群
  hasCards?: boolean;
  alive?: boolean;
  distance?: { min?: number; max?: number };
}

interface RangeRule {
  type: 'attack' | 'unlimited' | 'adjacent' | 'fixed';
  value?: number;  // fixed 时固定距离
}
```

**距离计算**（服务端统一）：

- 基础距离 = 最小座位环距离
- `-1`：攻击范围 -1 装备（如诸葛连弩不算，青釭剑等）
- `+N`：马、武器范围
- 技能修正：马术、义从等通过 `DistanceModifier` 插件叠加

### 4.5 Effect 动作原语

尽量用 **小集合原语** 组合复杂效果，而非每张牌写一个巨型函数：

| action | 说明 | 典型用途 |
|--------|------|----------|
| `draw` | 摸 N 张牌 | 英姿、遗计 |
| `discard` | 弃置牌（可选手牌/装备/判定区） | 过河拆桥、奇袭 |
| `moveCard` | 移动牌到指定区域 | 顺手牵羊、反馈 |
| `damage` | 造成 N 点伤害 | 杀、南蛮、雷击 |
| `recover` | 回复体力 | 桃、青囊 |
| `judge` | 发起判定 | 闪电、乐不思蜀 |
| `modifyJudge` | 改判 | 鬼才、天妒 |
| `useVirtualCard` | 视为使用某牌 | 龙胆、武圣 |
| `showCard` | 展示牌 | 反间、耀武 |
| `chooseOption` | 让目标二选一 | 刚烈、离间 |
| `skipPhase` | 跳过阶段 | 乐不思蜀 |
| `extraTurn` | 额外回合 | （标准版少见） |
| `restructureHand` | 手牌上限/重排 | 英姿（界） |
| `promptResponse` | 等待响应（出闪/杀/无懈） | 杀、万箭齐发 |

**Effect 管道示例（【杀】）：**

```yaml
# config/cards/basic/sha.yml
id: sha
name: 杀
type: basic
subType: null
targeting:
  selector: choose
  count: { min: 1, max: 1 }
  filter:
    relation: [other]
  range:
    type: attack
effects:
  - action: promptResponse
    params:
      responseType: shan
      onFail:
        - action: damage
          params: { amount: 1, source: self, damageType: normal }
```

### 4.6 三层引擎与零武将分支（当前方向）

> **完整设计**见 [engine-core-design.md](./engine-core-design.md)。代码入口：`SangokushiEngine`（`packages/engine/src/core/`）。

```
GameState（纯数据） + TurnPhaseFSM（回合） + ResolutionStack（LIFO）
        ↑                              ↓
        └──────── RuleManager ─────────┘
              ↑ 配置加载 ConfigRuleLoader
              ├─ EffectExecutor（原子效果，~15 个 action）
              ├─ ConditionRegistry（谓词，禁止 eval）
              └─ InteractionRegistry（交互模式名，非武将 id）
```

**不为每个武将写 `if (skillId)`**。扩展方式：

| 方式 | 何时用 |
|------|--------|
| `effects: [{ action: 'draw', ... }]` | 单步/可组合原子 |
| `conditions: [{ predicate: 'hpAtMost', params: { n: 2 } }]` | 触发条件 |
| `handler: 'stealHands'` | 多步 UI（突袭、反间等），**一个 Handler 服务多个将** |

约 **70%** 牌/技能仅配置 + 原子；**~6–10 个交互 Handler** 覆盖剩余多步技能。

### 4.7 结算堆栈与 Pre / On / Post

```
Player A 使用【杀】→ push UseCardEvent
  → pre:  无懈（可 push 子事件，栈顶先结算）
  → on:   目标出【闪】
  → execute: 未响应 → push DamageEvent
  → post: 奸雄、反馈、遗计…
```

- **ResolutionStack**：LIFO，嵌套响应、濒死插入（`MAX_DEPTH = 255`）
- **TargetQueue**：FIFO，万箭/南蛮逆时针逐目标
- **EventResolver.resolve**：统一 `pre → on → execute → post`

遗留 `GameEngine` 仍存在于 `packages/engine/src/engine/`；**新逻辑只加在 `SangokushiEngine` 管线**，测试房已通过 `GameService` 挂载引擎实例。

### 4.10 Prompt 类型（UI 暂停点）

引擎通过 `GamePrompt` 暂停流水线，由客户端 `GamePromptModal` 渲染：

| type | 场景 |
|------|------|
| `play_card_confirm` | 确认打出 |
| `select_targets` | 选目标角色 |
| `response` | 出闪/杀响应 |
| `select_zone_card` | 过河拆桥/顺手牵羊选区域牌 |
| `discard_cards` | 弃牌阶段 |
| `modify_judge` | 鬼才改判 |
| `use_skill` | 发动/取消技能、仁德/制衡等多步技能 |

### 4.11 选区域牌规则（过河拆桥 / 顺手牵羊）

- 可选目标**手牌区**与**装备区**（判定区后续扩展）
- 对手手牌：**不展示牌面**，显示「手牌 N」，列表顺序**随机打乱**（`id` 仍映射真实下标）
- 装备：**明牌**展示装备名
- 支持取消（`choiceId: cancel`），关闭弹窗

### 4.8 配置目录建议

```
packages/card-config/
├── characters/
│   ├── wei/
│   │   ├── cao_cao.yml
│   │   └── ...
│   └── index.yml          # 30 将索引
├── cards/
│   ├── basic/
│   ├── trick/
│   └── equipment/
├── identities.yml
└── schema/                # JSON Schema 校验
    ├── character.schema.json
    ├── card.schema.json
    └── effect.schema.json
```

### 4.9 前端与配置的关系

- 前端 **只展示** 服务端下发的 `GameState` 快照（手牌对自己可见，他人隐藏）
- 卡牌名称、描述可从配置 API `GET /api/cards` 拉取做图鉴；对局内以服务端为准
- WPS 表格单元格映射：`A3` = 1 号位武将区，`B12` = 手牌区等（见 ui-disguise.md）

---

## 5. 数据流与状态同步

```
用户操作 → WS game:action
         → Gateway 校验 (RoomGuard, TurnGuard)
         → GameEngine.handleAction()
         → 产生 GameEvent[]
         → 更新 GameState
         → 广播 game:state (增量) + game:event (动画/日志)
```

**GameState 要点字段：**

```typescript
interface GameState {
  phase: GamePhase;
  currentPlayer: number;      // seat
  turnOrder: number[];
  players: PlayerState[];
  deck: { remaining: number };
  discardPile: CardInstance[];
  pending: PendingAction | null;  // 当前等待的响应
  log: GameLogEntry[];
}
```

---

## 6. 安全与防作弊

- 服务端洗牌、摸牌、判定
- 客户端不可提交「我摸到了什么」；只提交「我要对 seat 3 出杀」
- 敏感信息按 playerId 过滤后下发（`filterStateForPlayer`）
- 操作序列号防重放

---

## 7. 分期实施建议

| 阶段 | 内容 |
|------|------|
| M1 | 房间 + 聊天 + WPS 壳 UI + 空表格 | ✅ |
| M2 | `@tk/engine` + 测试房完整交互（杀闪、伤害栈、选区域牌、受伤后技能） | ✅ |
| M3 | 标准锦囊全套 + 装备 + AOE TargetQueue | 🚧 |
| M4 | 界限突破 30 将（优先高频将） | 🚧 |
| M5 | 正式房间对局、断线重连、观战、战绩 | 🔲 |

---

## 8. Monorepo 结构建议

```
three-kingdoms-kill/
├── docs/                 # 本文档
├── packages/
│   ├── engine/           # @tk/engine — SangokushiEngine
│   └── shared/           # @tk/shared — 前后端共享类型
├── client/               # React WPS UI
├── server/               # NestJS
├── docker-compose.yml
└── README.md
```
