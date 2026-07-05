# 标准版·界限突破 30 将技能矩阵 · REQ-2026-004

- 版本：v1
- 范围：`standard-2014`，30 名武将，55 个技能
- 规则来源：`docs/cards/characters.md`、`docs/gameplay.md`、`packages/shared/src/versions.ts`
- 判定口径：`full` 表示已有专门规则结算与可执行测试覆盖；`partial` 表示存在引擎入口或通用结算，但尚未完整覆盖官方/通行规则；`config` 表示仅有技能配置或展示能力。

## 汇总

| 状态 | 数量 | 说明 |
|---|---:|---|
| full | 55 | 已有专门结算路径和测试覆盖，可作为当前验收证据 |
| partial | 0 | 当前无 partial 项 |
| config | 0 | 当前无仅配置项 |

## 技能矩阵

| 武将 | 技能 | 时机 | 当前状态 | 实现入口 | 验收证据 |
|---|---|---|---|---|---|
| 界曹操 | 奸雄 | 受到伤害后 | full | `RuleResolver` 反应技能、`SangokushiEngine.submitPromptChoice` | `turn-runner.spec.ts` 覆盖受到伤害后确认发动、获得伤害牌并摸一张 |
| 界曹操 | 护驾 | 需要闪 | full | `CardPlayService` 主公技代响应流程 | `card-play-service.spec.ts` 覆盖主公发动【护驾】、魏势力角色代出【闪】并抵消【杀】 |
| 界司马懿 | 反馈 | 受到伤害后 | full | `RuleResolver` 反应技能、`EffectExecutor.moveCard(from=damageSource)` | `turn-runner.spec.ts` 覆盖受到伤害后确认发动、获得伤害来源一张牌 |
| 界司马懿 | 鬼才 | 判定生效前 | full | `TurnRunner.submitModifyJudge` | `turn-runner.spec.ts` 覆盖改判流程与多名角色按座次依次选择是否改判 |
| 界夏侯惇 | 刚烈 | 受到伤害后 | full | `RuleResolver` 反应技能、`EffectExecutor.judge` | `turn-runner.spec.ts` 覆盖红判对伤害来源造成伤害、黑判弃置伤害来源一张牌 |
| 界夏侯惇 | 清俭 | 摸牌阶段外获得牌后 | full | `SangokushiEngine.afterPlayerGainedCards`、`SkillPlayService.giveCards` | `skill-play-service.spec.ts` 覆盖摸牌阶段外获得牌后可分配本次获得牌、不可交旧手牌、可全部交出或部分交出后结束分配 |
| 界张辽 | 突袭 | 摸牌前 | full | `SangokushiEngine.submitPromptChoice` before_draw 分支 | `turn-runner.spec.ts` 覆盖获得至多两名其他角色手牌并少摸等量牌 |
| 界许褚 | 裸衣 | 摸牌前 | full | `runSkillEffects`、`CardPlayService.applyDamageModifiers` | `turn-runner.spec.ts` 覆盖跳过摸牌、获得亮出的基本牌/武器/决斗并记录伤害加成 |
| 界郭嘉 | 天妒 | 判定后 | full | `TurnRunner.finishJudgeResolution` | `turn-runner.spec.ts` 覆盖普通判定获得判定牌、被【鬼才】改判后获得最终判定牌、【闪电】未生效移走时不获得判定牌 |
| 界郭嘉 | 遗计 | 受到伤害后 | full | `SangokushiEngine.submitPromptChoice`、`SkillPlayService.giveCards` | `turn-runner.spec.ts` 覆盖受伤后发动、摸两张、分配至多两张给不同其他角色与完成流程 |
| 甄姬 | 倾国 | 需要闪 | full | `virtual-card.ts` | `virtual-card.spec.ts` 覆盖黑色牌当【闪】 |
| 甄姬 | 洛神 | 准备阶段 | full | `SangokushiEngine.performLuoshen` prepare 分支 | `turn-runner.spec.ts` 覆盖黑判获得并继续、红判停止弃置、黑判后主动停止进入判定阶段 |
| 界李典 | 恂恂 | 摸牌前 | full | `SangokushiEngine` before_draw `xunxun` 分支 | `turn-runner.spec.ts` 覆盖调整牌堆顶后按调整结果摸牌 |
| 界李典 | 忘隙 | 造成/受到伤害后 | full | `SangokushiEngine.resolveWangxiAfterDamage` | `card-play-service.spec.ts` 覆盖造成和受到伤害两条路径 |
| 界刘备 | 仁德 | 出牌阶段 | full | `SkillPlayService.giveCards`、`CardPlayService.initiateVirtualSkillCard`、`rendeGive` | `skill-play-service.spec.ts` 覆盖多次给牌、第二次给牌后可视为使用基本牌、放弃使用与虚拟牌不消耗手牌实体 |
| 界刘备 | 激将 | 需要杀 | full | `CardPlayService` 主公技代响应流程 | `card-play-service.spec.ts` 覆盖主公发动【激将】、蜀势力角色代出【杀】并继续【决斗】响应链 |
| 界关羽 | 武圣 | 出牌/需要杀 | full | `virtual-card.ts`、`CardPlayService` | `card-play-service.spec.ts` 覆盖红色牌当【杀】 |
| 界关羽 | 义绝 | 出牌阶段 | full | `SkillPlayService.executeYijuePindian` / `executeYijueRecoverChoice` | `skill-play-service.spec.ts` 覆盖拼点赢后禁止目标本回合使用/打出手牌且非锁定技失效、拼点未赢后可令目标回复、无手牌/无目标拦截 |
| 界张飞 | 咆哮 | 使用杀 | full | `CardPlayService.canUseSha` | `card-play-service.spec.ts` 覆盖一回合多次使用【杀】；同时覆盖无【咆哮】角色第二张【杀】被次数限制拦截 |
| 界张飞 | 替身 | 准备阶段 | full | `SangokushiEngine.submitPromptChoice` prepare 分支 | `turn-runner.spec.ts` 覆盖发动、回复摸牌、限定技不可重复 |
| 诸葛亮 | 观星 | 准备阶段 | full | `SangokushiEngine` prepare `guanxing` 分支 | `turn-runner.spec.ts` 覆盖准备阶段调整牌堆顶并按调整结果摸牌；`GamePromptModal` 支持排序提交 |
| 诸葛亮 | 空城 | 成为目标前 | full | `getValidTargets` 目标合法性过滤 | `card-play-service.spec.ts` 覆盖无手牌时不能成为【杀】/【决斗】目标 |
| 界赵云 | 龙胆 | 出牌/响应 | full | `virtual-card.ts` | `virtual-card.spec.ts` 覆盖【杀】/【闪】互换 |
| 界赵云 | 涯角 | 回合外使用/打出手牌 | full | `SangokushiEngine.afterPlayerUsedOrRespondedHandCard` / `promptPendingYajiao` | `turn-runner.spec.ts` 覆盖回合外打出手牌后展示牌类别比较、同类别交给角色、不同类别置入弃牌堆 |
| 界马超 | 马术 | 距离计算 | full | `distanceBetween`、`getValidTargets` | `card-play-service.spec.ts` 覆盖距离 2 角色可成为【杀】与【顺手牵羊】目标 |
| 界马超 | 铁骑 | 杀指定目标后 | full | `CardPlayService.submitTieqi` / `resolveTieqiJudge` | `card-play-service.spec.ts` 覆盖可选择不发动、发动后目标非锁定技失效、弃同花色手牌解除限制、未弃牌/无同花色手牌时禁止【闪】响应 |
| 界黄月英 | 集智 | 使用普通锦囊 | full | `SangokushiEngine.onCardCommitted` | `card-play-service.spec.ts` 覆盖普通锦囊触发与延时锦囊不触发 |
| 界黄月英 | 奇才 | 锦囊距离/装备保护 | full | `getValidTargets`、`canDiscardZoneCard` | `card-play-service.spec.ts` 覆盖锦囊无距离限制、装备区防具/宝物不可被其他角色弃置 |
| 界徐庶 | 诛害 | 他人结束阶段 | full | `TurnRunner.advanceToEnd`、`SangokushiEngine.executeZhuhai` | `turn-runner.spec.ts` 覆盖造成过伤害的其他角色结束阶段可发动【诛害】使用【杀】、跳过继续结束流程、未造成伤害不触发 |
| 界徐庶 | 潜心 | 造成伤害后觉醒 | full | `SangokushiEngine.resolveQianxinAfterDamage` | `card-play-service.spec.ts` 覆盖造成伤害后若已受伤则觉醒、减 1 点体力上限、获得【荐言】与一局只觉醒一次 |
| 界徐庶 | 荐言 | 出牌阶段 | full | `SkillPlayService.executeJianyan` | `skill-play-service.spec.ts` 覆盖声明并交给所选目标 |
| 孙权 | 制衡 | 出牌阶段 | full | `zhihengConfirm` | `turn-runner.spec.ts` 覆盖弃置任意张手牌并摸等量牌 |
| 孙权 | 救援 | 需要桃 | full | `SangokushiEngine.promptNextDyingRescue` / `submitDyingRescue` | `turn-runner.spec.ts` 覆盖主公濒死时吴势力角色响应【救援】代出【桃】救助 |
| 界甘宁 | 奇袭 | 出牌阶段 | full | `virtual-card.ts`、`CardPlayService` | `card-play-service.spec.ts` 覆盖黑色牌当【过河拆桥】 |
| 界甘宁 | 奋威 | 多目标锦囊生效时 | full | `CardPlayService.submitFenwei` | `card-play-service.spec.ts` 覆盖弃置手牌取消多目标锦囊对自己的影响、跳过后继续正常响应 |
| 界吕蒙 | 克己 | 弃牌阶段 | full | `TurnRunner.enterDiscardPhase`、`submitPromptChoice` | `turn-runner.spec.ts` 覆盖可发动/不可发动 |
| 界吕蒙 | 勤学 | 弃牌阶段 | full | `TurnRunner.performQinxue`、`GamePromptModal` discard_draw 流程 | `turn-runner.spec.ts` 覆盖弃一摸二、两花色记录、【杀】次数 +1 |
| 界黄盖 | 苦肉 | 出牌阶段 | full | `SkillPlayService` `kurou` 分支 | `skill-play-service.spec.ts` 覆盖发动与低体力拦截 |
| 界黄盖 | 诈降 | 失去体力后 | full | `SkillPlayService` `zhaxiang` 分支 | `skill-play-service.spec.ts` 覆盖失去体力至 1 后弃红牌回复、弃红牌摸两张、无红牌不触发 |
| 界周瑜 | 英姿 | 摸牌/手牌上限 | full | `TurnRunner.performDraw`、`handLimitFor` | `turn-runner.spec.ts` 覆盖摸牌阶段额外摸一张与手牌上限按体力上限计算 |
| 界周瑜 | 反间 | 出牌阶段 | full | `SkillPlayService.executeFanjianGive` / `executeFanjianResolve` | `skill-play-service.spec.ts` 覆盖展示交牌、目标弃同花色所有手牌或失去体力两条分支 |
| 界大乔 | 国色 | 出牌阶段 | full | `virtual-card.ts`、`CardPlayService` | `card-play-service.spec.ts` 覆盖方块牌当【乐不思蜀】 |
| 界大乔 | 流离 | 成为杀目标时 | full | `CardPlayService.submitLiuli` | `card-play-service.spec.ts` 覆盖发动与跳过 |
| 界陆逊 | 谦逊 | 成为乐/顺目标时 | full | `CardPlayService.submitQianxun` | `card-play-service.spec.ts` 覆盖发动与跳过 |
| 界陆逊 | 连营 | 失去最后手牌后 | full | `SangokushiEngine.afterPlayerLostHandCards` | `card-play-service.spec.ts` 覆盖拆手牌触发 |
| 孙尚香 | 结姻 | 出牌阶段 | full | `SkillPlayService.discardRecover` | `skill-play-service.spec.ts` 覆盖弃两张手牌、男性且已受伤目标约束 |
| 孙尚香 | 枭姬 | 失去装备后 | full | `SangokushiEngine.afterPlayerLostEquipmentCards`、`CardPlayService` 装备失去回调 | `card-play-service.spec.ts` 覆盖装备被弃置、被获得、替换旧装备三条路径摸两张 |
| 界华佗 | 急救 | 回合外需要桃 | full | `validResponseCardsForPlayer`、`SangokushiEngine.promptNextDyingRescue` | `virtual-card.spec.ts` 覆盖红色牌当【桃】；`turn-runner.spec.ts` 覆盖回合外急救救助与回合内不可转化 |
| 界华佗 | 青囊 | 出牌阶段 | full | `SkillPlayService.discardRecover` | `skill-play-service.spec.ts` 覆盖回复、红牌续发动、无目标拦截 |
| 界吕布 | 无双 | 杀/决斗响应 | full | `applyLockedModifiers`、`CardPlayService.submitResponse` | `card-play-service.spec.ts` 覆盖【杀】目标需连续打出两张【闪】、【决斗】响应方需连续打出两张【杀】 |
| 界吕布 | 利驭 | 杀造成伤害后 | full | `SangokushiEngine.resolveLiyuAfterDamage`、`SkillPlayService.executeLiyu`、`GamePromptModal` give_card_duel_target 流程 | `skill-play-service.spec.ts` 覆盖受伤角色给牌、吕布视为对另一名角色使用【决斗】、跳过分支、非【杀】伤害/无牌/无决斗目标不触发 |
| 界貂蝉 | 离间 | 出牌阶段 | full | `SkillPlayService.executeLijian`、`CardPlayService` 决斗响应链 | `skill-play-service.spec.ts` 覆盖弃牌、两名男性目标、视为决斗与决斗响应切换 |
| 界貂蝉 | 闭月 | 结束阶段 | full | `TurnRunner.enterEndPhase`、`submitPromptChoice` | `turn-runner.spec.ts` 覆盖 1/2 张摸牌分支 |
| 华雄 | 耀武 | 受到杀伤害时 | full | `SangokushiEngine.resolveYaowuAfterDamage` | `turn-runner.spec.ts` 覆盖红色【杀】令伤害来源回复、来源满体力改摸牌、非红色【杀】华雄摸牌 |
| 袁术 | 妄尊 | 主公准备阶段 | full | `TurnRunner.submitWangzun`、弃牌阶段手牌上限修正 | `turn-runner.spec.ts` 覆盖主公准备阶段非当前回合角色发动、摸牌、主公本回合手牌上限 -1 与跳过分支 |
| 袁术 | 同疾 | 杀目标限制 | full | `getValidTargets` 目标合法性过滤 | `card-play-service.spec.ts` 覆盖攻击范围内含有袁术时【杀】只能指定袁术 |
| 界公孙瓒 | 趫猛 | 黑杀造成伤害后 | full | `SangokushiEngine.resolveQiaomengAfterDamage`、`submitQiaomengChoice` | `card-play-service.spec.ts` 覆盖黑色【杀】造成伤害后发动、坐骑获得、非坐骑弃置、红色【杀】/无装备不触发 |
| 界公孙瓒 | 义从 | 距离计算 | full | `distanceBetween`、`getValidTargets` | `card-play-service.spec.ts` 覆盖体力大于 2 时对外距离 -1、体力不大于 2 时他人计算其距离 +1 |

## 后续维护口径

1. 后续若引入新版本或新武将，需先按本矩阵口径补齐 `full` 级实现与测试证据，再开放给玩家选择。
2. 修改 55 个已验收技能时，需同步维护本矩阵中的实现入口和测试证据。
