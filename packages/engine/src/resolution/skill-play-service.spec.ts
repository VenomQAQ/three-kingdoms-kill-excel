import { describe, expect, it } from 'vitest';
import { SangokushiEngine } from '../core/sangokushi-engine';
import type { EnginePlayerState } from '../types/game';

function player(
  id: string,
  seat: number,
  generalName: string,
  overrides: Partial<EnginePlayerState> = {},
): EnginePlayerState {
  return {
    id,
    seat,
    nickname: id,
    generalId: id,
    generalName,
    role: seat === 1 ? '主公' : '反贼',
    roleRevealed: seat === 1,
    kingdom: 'shu',
    hp: 4,
    maxHp: 4,
    handCards: [],
    equipment: [],
    judgeCards: [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
    usedLimitedSkills: {},
    lastTurnEndHp: 4,
    dead: false,
    ...overrides,
  };
}

function engineForQingnang(handCards: string[]): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, '华佗', { handCards }),
      player('b', 2, '关羽', { hp: 3 }),
      player('c', 3, '张飞', { hp: 2 }),
      player('d', 4, '赵云'),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

describe('SkillPlayService 青囊', () => {
  it('弃置一张手牌令受伤角色回复 1 点体力', () => {
    const engine = engineForQingnang(['♣7【杀】']);

    expect(engine.initiateSkill('a', 'qingnang')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'qingnang',
      skillAction: 'discard_recover',
      validTargetIds: ['b', 'c'],
    });

    expect(engine.qingnangRecover('a', 'b', 0)).toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual([]);
    expect(state.players[1]!.hp).toBe(4);
    expect(state.players[0]!.skillUseCount.qingnang).toBe(1);
    expect(state.players[0]!.skillTargetUseCount.qingnang).toEqual(['b']);
    expect(state.prompt).toBeNull();
    expect(engine.snapshot().discardPile).toContain('杀');
  });

  it('弃置红色手牌后可继续对未选择过的受伤角色发动', () => {
    const engine = engineForQingnang(['♥7【杀】', '♣8【闪】']);

    expect(engine.initiateSkill('a', 'qingnang')).toMatchObject({ ok: true });
    expect(engine.qingnangRecover('a', 'b', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'qingnang',
      validTargetIds: ['c'],
    });
    expect(engine.qingnangRecover('a', 'b', 0)).toMatchObject({
      ok: false,
      error: '目标不合法',
    });

    expect(engine.qingnangRecover('a', 'c', 0)).toMatchObject({ ok: true });
    expect(engine.getState().players[2]!.hp).toBe(3);
    expect(engine.getState().players[0]!.skillUseCount.qingnang).toBe(2);
    expect(engine.getState().players[0]!.skillTargetUseCount.qingnang).toEqual(['b', 'c']);
    expect(engine.getState().prompt).toBeNull();
  });

  it('没有受伤角色时不能发动', () => {
    const engine = engineForQingnang(['♥7【杀】']);
    engine.getState().players[1]!.hp = 4;
    engine.getState().players[2]!.hp = 4;

    expect(engine.initiateSkill('a', 'qingnang')).toMatchObject({
      ok: false,
      error: '没有需要回复的合法目标角色',
    });
  });
});

describe('SkillPlayService 仁德', () => {
  function engineForRende(): SangokushiEngine {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界刘备', { handCards: ['♣7【闪】', '♦8【桃】', '♠9【杀】'] }),
        player('b', 2, '关羽', { handCards: ['♠2【闪】'] }),
        player('c', 3, '张飞'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    return engine;
  }

  it('第二次给牌后可视为使用一张基本牌，且不消耗手牌实体', async () => {
    const engine = engineForRende();

    expect(engine.initiateSkill('a', 'rende')).toMatchObject({ ok: true });
    expect(engine.rendeGive('a', 'b', ['♣7【闪】'], [0])).toMatchObject({ ok: true });

    expect(engine.initiateSkill('a', 'rende')).toMatchObject({ ok: true });
    expect(engine.rendeGive('a', 'c', ['♦8【桃】'], [0])).toMatchObject({ ok: true });

    const basicPrompt = engine.getState().prompt!;
    expect(basicPrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'rende',
      skillAction: 'virtual_basic',
    });
    expect(basicPrompt.options?.map((option) => option.id)).toEqual([
      'rende:basic:杀',
      'rende:basic:桃',
      'rende:basic:酒',
      'cancel',
    ]);

    await expect(
      engine.submitPromptChoice('a', basicPrompt.id, 'rende:basic:杀'),
    ).resolves.toMatchObject({ ok: true });

    const targetPrompt = engine.getState().prompt!;
    expect(targetPrompt).toMatchObject({
      type: 'select_targets',
      cardName: '杀',
      skillId: 'rende',
      validTargetIds: ['b', 'c'],
    });

    await expect(engine.selectTargets('a', targetPrompt.id, ['b'])).resolves.toMatchObject({
      ok: true,
    });
    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      validResponseCards: ['♠2【闪】', '♣7【闪】'],
    });

    await expect(
      engine.submitResponse('b', engine.getState().prompt!.id, 'card:闪'),
    ).resolves.toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual(['♠9【杀】']);
    expect(state.players[1]!.handCards).toEqual(['♣7【闪】']);
    expect(state.players[2]!.handCards).toEqual(['♦8【桃】']);
    expect(state.players[0]!.skillUseCount.rende).toBe(2);
    expect(state.players[0]!.shaUsedCount).toBe(1);
    expect(state.prompt).toBeNull();
    expect(engine.snapshot().discardPile).not.toContain('杀');
  });

  it('第二次给牌后可以放弃视为使用基本牌', async () => {
    const engine = engineForRende();

    expect(engine.initiateSkill('a', 'rende')).toMatchObject({ ok: true });
    expect(engine.rendeGive('a', 'b', ['♣7【闪】'], [0])).toMatchObject({ ok: true });
    expect(engine.initiateSkill('a', 'rende')).toMatchObject({ ok: true });
    expect(engine.rendeGive('a', 'c', ['♦8【桃】'], [0])).toMatchObject({ ok: true });

    const prompt = engine.getState().prompt!;
    await expect(engine.submitPromptChoice('a', prompt.id, 'cancel')).resolves.toMatchObject({
      ok: true,
    });

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().players[0]!.handCards).toEqual(['♠9【杀】']);
  });
});

describe('SkillPlayService 苦肉', () => {
  it('出牌阶段失去 1 点体力并摸两张牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄盖', { hp: 4, maxHp: 4 }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['杀', '闪']);

    expect(engine.initiateSkill('a', 'kurou')).toMatchObject({ ok: true });

    const huangGai = engine.getState().players[0]!;
    expect(huangGai.hp).toBe(3);
    expect(huangGai.handCards).toHaveLength(2);
    expect(huangGai.handCards[0]).toContain('【杀】');
    expect(huangGai.handCards[1]).toContain('【闪】');
    expect(huangGai.skillUseCount.kurou).toBe(1);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log).toContain(
      '界黄盖 发动【苦肉】，失去 1 点体力并摸 2 张牌（3/4）',
    );
  });

  it('体力为 1 时不能发动', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄盖', { hp: 1, maxHp: 4 }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'kurou')).toMatchObject({
      ok: false,
      error: '当前体力不足，不能发动【苦肉】',
    });
  });
});

describe('SkillPlayService 清俭', () => {
  it('摸牌阶段外获得牌后可只交出本次获得的牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界夏侯惇', { handCards: ['♠9【杀】'] }),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    const gained = ['♣7【杀】', '♦8【闪】'];
    engine.getState().players[0]!.handCards.push(...gained);
    engine.afterPlayerGainedCards(engine.getState().players[0]!, gained);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'qingjian',
      skillAction: 'give_cards',
      validTargetIds: ['b', 'c'],
      discardCount: 2,
      discardHandIndices: [1, 2],
    });

    expect(engine.rendeGive('a', 'b', [engine.getState().players[0]!.handCards[0]!], [0])).toMatchObject({
      ok: false,
      error: '【清俭】只能交给这次获得的牌',
    });

    expect(engine.rendeGive('a', 'b', [engine.getState().players[0]!.handCards[1]!], [1])).toMatchObject({
      ok: true,
    });

    const nextPrompt = engine.getState().prompt!;
    expect(nextPrompt).toMatchObject({
      skillId: 'qingjian',
      discardCount: 1,
      discardHandIndices: [1],
    });

    expect(engine.rendeGive('a', 'c', [engine.getState().players[0]!.handCards[1]!], [1])).toMatchObject({
      ok: true,
    });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual(['♠9【杀】']);
    expect(state.players[1]!.handCards).toHaveLength(1);
    expect(state.players[2]!.handCards).toHaveLength(1);
    expect(state.players[0]!.skillUseCount.qingjian).toBe(1);
    expect(state.resolution.context.qingjianPending).toBeUndefined();
    expect(state.prompt).toBeNull();
  });

  it('清俭可交出部分本次获得牌后结束分配', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界夏侯惇', { handCards: [] }),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    const gained = ['♣7【杀】', '♦8【闪】'];
    engine.getState().players[0]!.handCards.push(...gained);
    engine.afterPlayerGainedCards(engine.getState().players[0]!, gained);

    expect(engine.rendeGive('a', 'b', [engine.getState().players[0]!.handCards[0]!], [0])).toMatchObject({
      ok: true,
    });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      skillId: 'qingjian',
      discardCount: 1,
      discardHandIndices: [0],
    });

    await expect(engine.submitPromptChoice('a', prompt.id, 'qingjian:finish')).resolves.toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual(['♦8【闪】']);
    expect(state.players[1]!.handCards).toEqual(['♣7【杀】']);
    expect(state.players[2]!.handCards).toHaveLength(0);
    expect(state.players[0]!.skillUseCount.qingjian).toBe(1);
    expect(state.resolution.context.qingjianPending).toBeUndefined();
    expect(state.prompt).toBeNull();
  });
});

describe('SkillPlayService 诈降', () => {
  it('失去体力至 1 后可弃红牌回复 1 点体力', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄盖', {
          hp: 2,
          maxHp: 4,
          handCards: ['♥5【杀】', '♠9【闪】'],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['杀', '闪']);

    expect(engine.initiateSkill('a', 'kurou')).toMatchObject({ ok: true });

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'a',
      skillId: 'zhaxiang',
      skillAction: 'discard_red_then_choose',
    });
    expect(prompt.discardHandIndices).toContain(0);

    await expect(
      engine.submitPromptChoice('a', prompt.id, 'zhaxiang:recover:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    const huangGai = engine.getState().players[0]!;
    expect(huangGai.hp).toBe(2);
    expect(huangGai.handCards).not.toContain('♥5【杀】');
    expect(huangGai.skillUseCount.zhaxiang).toBe(1);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log.some((entry) => entry.includes('界黄盖 发动【诈降】'))).toBe(
      true,
    );
    expect(
      engine.getState().log.some((entry) => entry.includes('并回复 1 点体力（2/4）')),
    ).toBe(true);
  });

  it('失去体力至 1 后可弃红牌摸两张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄盖', {
          hp: 2,
          maxHp: 4,
          handCards: ['♦7【闪】'],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['杀', '桃', '闪', '酒']);

    expect(engine.initiateSkill('a', 'kurou')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;

    await expect(
      engine.submitPromptChoice('a', prompt.id, 'zhaxiang:draw:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    const huangGai = engine.getState().players[0]!;
    expect(huangGai.hp).toBe(1);
    expect(huangGai.handCards).toHaveLength(4);
    expect(huangGai.handCards.some((card) => card.includes('【桃】'))).toBe(true);
    expect(huangGai.handCards.some((card) => card.includes('【酒】'))).toBe(true);
    expect(huangGai.skillUseCount.zhaxiang).toBe(1);
  });

  it('失去体力至 1 但当前没有红色手牌时不触发', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄盖', {
          hp: 2,
          maxHp: 4,
          handCards: ['♣9【闪】'],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['♠1【决斗】', '♣3【过河拆桥】']);

    expect(engine.initiateSkill('a', 'kurou')).toMatchObject({ ok: true });

    const huangGai = engine.getState().players[0]!;
    expect(huangGai.hp).toBe(1);
    expect(huangGai.skillUseCount.zhaxiang).toBeUndefined();
    expect(engine.getState().prompt).toBeNull();
  });
});

describe('SkillPlayService 荐言', () => {
  it('可将符合声明的牌交给所选目标，而不是默认第一个目标', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界徐庶'),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['杀']);

    expect(engine.initiateSkill('a', 'jianyan')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'jianyan',
      validTargetIds: ['b', 'c'],
    });

    await expect(
      engine.submitPromptChoice('a', prompt.id, 'jianyan:basic:c'),
    ).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().players[2]!.handCards[0]).toContain('【杀】');
    expect(engine.getState().players[0]!.skillUseCount.jianyan).toBe(1);
  });
});

describe('SkillPlayService 结姻', () => {
  it('弃置两张手牌令一名已受伤男性角色回复 1 点体力', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '孙尚香', { handCards: ['♣7【杀】', '♠8【闪】', '♥9【桃】'] }),
        player('b', 2, '界关羽', { hp: 3, maxHp: 4 }),
        player('c', 3, '甄姬', { hp: 2, maxHp: 3 }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'jieyin')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'jieyin',
      skillAction: 'discard_recover',
      discardCount: 2,
      validTargetIds: ['b'],
    });

    expect(engine.qingnangRecover('a', 'b', [0, 1])).toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual(['♥9【桃】']);
    expect(state.players[1]!.hp).toBe(4);
    expect(state.players[0]!.skillUseCount.jieyin).toBe(1);
    expect(state.players[0]!.skillTargetUseCount.jieyin).toEqual(['b']);
    expect(state.prompt).toBeNull();
    expect(engine.snapshot().discardPile).toEqual(expect.arrayContaining(['杀', '闪']));
  });

  it('没有两张手牌或没有已受伤男性目标时不能发动', () => {
    const noCards = new SangokushiEngine({
      players: [
        player('a', 1, '孙尚香', { handCards: ['♣7【杀】'] }),
        player('b', 2, '界关羽', { hp: 3, maxHp: 4 }),
      ],
    });
    noCards.getState().turn.index = 0;
    noCards.getState().turn.phase = 'play';

    expect(noCards.initiateSkill('a', 'jieyin')).toMatchObject({
      ok: false,
      error: '手牌不足，无法发动此技能',
    });

    const noTarget = new SangokushiEngine({
      players: [
        player('a', 1, '孙尚香', { handCards: ['♣7【杀】', '♠8【闪】'] }),
        player('b', 2, '界关羽', { hp: 4, maxHp: 4 }),
        player('c', 3, '甄姬', { hp: 2, maxHp: 3 }),
      ],
    });
    noTarget.getState().turn.index = 0;
    noTarget.getState().turn.phase = 'play';

    expect(noTarget.initiateSkill('a', 'jieyin')).toMatchObject({
      ok: false,
      error: '没有需要回复的合法目标角色',
    });
  });
});

describe('SkillPlayService 反间', () => {
  it('展示并交给目标一张手牌后，目标可弃置同花色所有手牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界周瑜', { handCards: ['♥7【杀】', '♠8【闪】'] }),
        player('b', 2, '界关羽', { handCards: ['♥3【桃】', '♣4【杀】', '♥9【闪】'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'fanjian')).toMatchObject({ ok: true });
    const givePrompt = engine.getState().prompt!;
    expect(givePrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'fanjian',
      skillAction: 'target_choice',
      validTargetIds: ['b'],
    });

    await expect(
      engine.submitPromptChoice('a', givePrompt.id, 'fanjian:give:b:0'),
    ).resolves.toMatchObject({ ok: true });
    expect(engine.getState().players[0]!.handCards).toEqual(['♠8【闪】']);
    expect(engine.getState().players[1]!.handCards).toEqual([
      '♥3【桃】',
      '♣4【杀】',
      '♥9【闪】',
      '♥7【杀】',
    ]);

    const resolvePrompt = engine.getState().prompt!;
    expect(resolvePrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'fanjian',
      playerId: 'b',
      sourcePlayerId: 'a',
      cardName: '♥7【杀】',
    });

    await expect(
      engine.submitPromptChoice('b', resolvePrompt.id, 'fanjian:discard_same_suit'),
    ).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.handCards).toEqual(['♣4【杀】']);
    expect(engine.getState().players[1]!.hp).toBe(4);
    expect(engine.getState().players[0]!.skillUseCount.fanjian).toBe(1);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.snapshot().discardPile).toEqual(expect.arrayContaining(['桃', '闪', '杀']));
  });

  it('目标可选择失去 1 点体力而不弃置手牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界周瑜', { handCards: ['♣7【杀】'] }),
        player('b', 2, '界关羽', { handCards: ['♣3【桃】', '♠4【杀】'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'fanjian')).toMatchObject({ ok: true });
    const givePrompt = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('a', givePrompt.id, 'fanjian:give:b:0'),
    ).resolves.toMatchObject({ ok: true });
    const resolvePrompt = engine.getState().prompt!;

    await expect(
      engine.submitPromptChoice('b', resolvePrompt.id, 'fanjian:lose_hp'),
    ).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.hp).toBe(3);
    expect(engine.getState().players[1]!.handCards).toEqual([
      '♣3【桃】',
      '♠4【杀】',
      '♣7【杀】',
    ]);
    expect(engine.getState().prompt).toBeNull();
  });

  it('无手牌或没有其他存活目标时不能发动', () => {
    const noCards = new SangokushiEngine({
      players: [player('a', 1, '界周瑜'), player('b', 2, '界关羽')],
    });
    noCards.getState().turn.index = 0;
    noCards.getState().turn.phase = 'play';
    expect(noCards.initiateSkill('a', 'fanjian')).toMatchObject({
      ok: false,
      error: '手牌为空，无法发动此技能',
    });

    const noTarget = new SangokushiEngine({
      players: [player('a', 1, '界周瑜', { handCards: ['♥7【杀】'] })],
    });
    noTarget.getState().turn.index = 0;
    noTarget.getState().turn.phase = 'play';
    expect(noTarget.initiateSkill('a', 'fanjian')).toMatchObject({
      ok: false,
      error: '没有合法的目标角色',
    });
  });
});

describe('SkillPlayService 离间', () => {
  it('弃置一张牌令一名男性角色视为对另一名男性角色使用决斗', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界貂蝉', { handCards: ['♥7【闪】'] }),
        player('b', 2, '界关羽', { handCards: ['♠5【杀】'] }),
        player('c', 3, '界张飞', { handCards: [] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'lijian')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'lijian',
      skillAction: 'discard_card_target_pair',
      validTargetIds: ['b', 'c'],
    });
    expect(prompt.skillCardOptions?.map((option) => option.id)).toEqual(['hand:0']);

    await expect(
      engine.submitPromptChoice('a', prompt.id, 'lijian:b:c:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'c',
      cardName: '决斗',
      sourcePlayerId: 'b',
      targetPlayerIds: ['c'],
      validResponseCards: [],
    });
    expect(engine.getState().players[0]!.handCards).toEqual([]);
    expect(engine.getState().players[0]!.skillUseCount.lijian).toBe(1);
    expect(engine.snapshot().discardPile).toContain('闪');

    await expect(engine.submitResponse('c', responsePrompt.id, 'pass')).resolves.toMatchObject({
      ok: true,
    });

    expect(engine.getState().players[2]!.hp).toBe(3);
    expect(engine.getState().prompt).toBeNull();
  });

  it('决斗目标打出杀后切换回离间指定的决斗来源响应', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界貂蝉', { handCards: ['♥7【闪】'] }),
        player('b', 2, '界关羽', { handCards: ['♠5【杀】'] }),
        player('c', 3, '界张飞', { handCards: ['♣6【杀】'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'lijian')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('a', prompt.id, 'lijian:b:c:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    const firstResponse = engine.getState().prompt!;
    await expect(engine.submitResponse('c', firstResponse.id, 'card:杀')).resolves.toMatchObject({
      ok: true,
    });

    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '决斗',
      sourcePlayerId: 'b',
      targetPlayerIds: ['c'],
      validResponseCards: ['♠5【杀】'],
    });
    expect(engine.getState().players[2]!.handCards).toEqual([]);
  });

  it('没有可弃置牌或男性目标不足时不能发动', () => {
    const noCard = new SangokushiEngine({
      players: [player('a', 1, '界貂蝉'), player('b', 2, '界关羽'), player('c', 3, '界张飞')],
    });
    noCard.getState().turn.index = 0;
    noCard.getState().turn.phase = 'play';
    expect(noCard.initiateSkill('a', 'lijian')).toMatchObject({
      ok: false,
      error: '没有可弃置的牌，无法发动此技能',
    });

    const noTargets = new SangokushiEngine({
      players: [
        player('a', 1, '界貂蝉', { handCards: ['♥7【闪】'] }),
        player('b', 2, '甄姬'),
      ],
    });
    noTargets.getState().turn.index = 0;
    noTargets.getState().turn.phase = 'play';
    expect(noTargets.initiateSkill('a', 'lijian')).toMatchObject({
      ok: false,
      error: '男性角色不足，无法发动【离间】',
    });
  });
});

describe('SkillPlayService 利驭', () => {
  it('杀造成伤害后受伤角色可令吕布获得其一张牌并指定另一名角色决斗', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布', { handCards: [] }),
        player('b', 2, '界张飞', { hp: 3, handCards: ['♥7【闪】'] }),
        player('c', 3, '界关羽', { handCards: [] }),
      ],
    });

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♠9【杀】',
    });

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'liyu',
      skillAction: 'give_card_duel_target',
      sourcePlayerId: 'a',
      targetPlayerIds: ['b'],
      validTargetIds: ['c'],
    });
    expect(prompt.skillCardOptions?.map((option) => option.id)).toEqual(['hand:0']);

    await expect(
      engine.submitPromptChoice('b', prompt.id, 'liyu:c:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'c',
      cardName: '决斗',
      sourcePlayerId: 'a',
      targetPlayerIds: ['c'],
      validResponseCards: [],
    });
    expect(engine.getState().players[0]!.handCards).toEqual(['♥7【闪】']);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().players[0]!.skillUseCount.liyu).toBe(1);

    await expect(engine.submitResponse('c', responsePrompt.id, 'pass')).resolves.toMatchObject({
      ok: true,
    });
    expect(engine.getState().players[2]!.hp).toBe(3);
    expect(engine.getState().prompt).toBeNull();
  });

  it('利驭可跳过且不会进入决斗响应', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布'),
        player('b', 2, '界张飞', { hp: 3, handCards: ['♥7【闪】'] }),
        player('c', 3, '界关羽'),
      ],
    });

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♣9【杀】',
    });

    const prompt = engine.getState().prompt!;
    await expect(engine.submitPromptChoice('b', prompt.id, 'skip')).resolves.toMatchObject({
      ok: true,
    });

    expect(engine.getState().players[0]!.handCards).toEqual([]);
    expect(engine.getState().players[1]!.handCards).toEqual(['♥7【闪】']);
    expect(engine.getState().players[0]!.skillUseCount.liyu).toBeUndefined();
    expect(engine.getState().prompt).toBeNull();
  });

  it('非杀伤害、受伤角色无牌或没有另一名决斗目标时不触发', async () => {
    const notSha = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布'),
        player('b', 2, '界张飞', { hp: 3, handCards: ['♥7【闪】'] }),
        player('c', 3, '界关羽'),
      ],
    });
    await notSha.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '决斗',
    });
    expect(notSha.getState().prompt).toBeNull();

    const noCards = new SangokushiEngine({
      players: [player('a', 1, '界吕布'), player('b', 2, '界张飞', { hp: 3 }), player('c', 3, '界关羽')],
    });
    await noCards.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♣9【杀】',
    });
    expect(noCards.getState().prompt).toBeNull();

    const noDuelTarget = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布'),
        player('b', 2, '界张飞', { hp: 3, handCards: ['♥7【闪】'] }),
      ],
    });
    await noDuelTarget.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♣9【杀】',
    });
    expect(noDuelTarget.getState().prompt).toBeNull();
  });
});

describe('SkillPlayService 义绝', () => {
  it('拼点赢后目标本回合不能使用或打出手牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界关羽', { handCards: ['♠13【杀】', '♥3【桃】'] }),
        player('b', 2, '界张飞', { handCards: ['♣7【闪】', '♠5【杀】'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'yijue')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'yijue',
      skillAction: 'pindian',
      validTargetIds: ['b'],
      discardHandIndices: [0, 1],
    });

    await expect(
      engine.submitPromptChoice('a', prompt.id, 'yijue:pindian:b:0:0'),
    ).resolves.toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.handCards).toEqual(['♥3【桃】']);
    expect(state.players[1]!.handCards).toEqual(['♠5【杀】']);
    expect(state.players[0]!.skillUseCount.yijue).toBe(1);
    expect(state.players[1]!.skillUseCount._yijue_hand_blocked).toBe(1);
    expect(state.players[1]!.skillUseCount._yijue_non_locked_disabled).toBe(1);
    expect(state.prompt).toBeNull();
    expect(engine.snapshot().discardPile).toEqual(expect.arrayContaining(['杀', '闪']));

    engine.getState().turn.index = 1;
    expect(engine.initiatePlayCard('b', '杀', 0)).toMatchObject({
      ok: false,
      error: '受到【义绝】影响，本回合不能使用手牌',
    });
    state.players[1]!.generalName = '界刘备';
    expect(engine.initiateSkill('b', 'rende')).toMatchObject({
      ok: false,
      error: '技能不存在',
    });
  });

  it('拼点未赢后可令目标回复 1 点体力', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界关羽', { handCards: ['♠3【杀】'] }),
        player('b', 2, '界张飞', { hp: 3, maxHp: 4, handCards: ['♣9【闪】'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'yijue')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('a', prompt.id, 'yijue:pindian:b:0:0'),
    ).resolves.toMatchObject({ ok: true });

    const recoverPrompt = engine.getState().prompt!;
    expect(recoverPrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'yijue',
      skillAction: 'recover_choice',
      targetPlayerIds: ['b'],
    });

    await expect(
      engine.submitPromptChoice('a', recoverPrompt.id, 'yijue:recover'),
    ).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.hp).toBe(4);
    expect(engine.getState().players[0]!.skillUseCount.yijue).toBe(1);
    expect(engine.getState().resolution.context.yijueRecover).toBeUndefined();
    expect(engine.getState().prompt).toBeNull();
  });

  it('无手牌或没有有手牌目标时不能发动', () => {
    const noCards = new SangokushiEngine({
      players: [player('a', 1, '界关羽'), player('b', 2, '界张飞', { handCards: ['♣7【闪】'] })],
    });
    noCards.getState().turn.index = 0;
    noCards.getState().turn.phase = 'play';
    expect(noCards.initiateSkill('a', 'yijue')).toMatchObject({
      ok: false,
      error: '手牌为空，无法发动此技能',
    });

    const noTarget = new SangokushiEngine({
      players: [player('a', 1, '界关羽', { handCards: ['♠13【杀】'] }), player('b', 2, '界张飞')],
    });
    noTarget.getState().turn.index = 0;
    noTarget.getState().turn.phase = 'play';
    expect(noTarget.initiateSkill('a', 'yijue')).toMatchObject({
      ok: false,
      error: '没有可拼点的目标角色',
    });
  });
});
