import { describe, expect, it } from 'vitest';
import { SangokushiEngine } from './sangokushi-engine';
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

async function playCardToTargets(
  engine: SangokushiEngine,
  playerId: string,
  cardName: string,
  targetIds: string[],
): Promise<void> {
  expect(engine.initiatePlayCard(playerId, cardName)).toMatchObject({ ok: true });
  const prompt = engine.getState().prompt!;
  if (prompt.type === 'play_card_confirm') {
    await expect(engine.submitPromptChoice(playerId, prompt.id, 'confirm')).resolves.toMatchObject({ ok: true });
  }
  const targetPrompt = engine.getState().prompt!;
  expect(targetPrompt).toMatchObject({ type: 'select_targets', playerId });
  await expect(engine.selectTargets(playerId, targetPrompt.id, targetIds)).resolves.toMatchObject({ ok: true });
}

describe('TurnRunner phase rules', () => {
  it('界曹操受到伤害后可发动奸雄，获得伤害牌并摸一张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界曹操', { hp: 4, handCards: [] }),
        player('b', 2, '关羽', { handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['闪']);

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 1,
      damageCardName: '杀',
    });

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:jianxiong');

    await engine.submitPromptChoice('a', prompt.id, 'skill:jianxiong');

    const caoCao = engine.getState().players[0]!;
    expect(caoCao.hp).toBe(3);
    expect(caoCao.handCards).toHaveLength(2);
    expect(caoCao.handCards).toContain('杀');
    expect(caoCao.handCards.some((card) => card.includes('【闪】'))).toBe(true);
    expect(caoCao.skillUseCount.jianxiong).toBe(1);
    expect(engine.getState().log).toContain('界曹操 获得伤害牌【杀】');
  });

  it('界曹操濒死被救回后可发动奸雄', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界曹操', { hp: 4, handCards: [], kingdom: 'wei' }),
        player('b', 2, '界司马懿', { handCards: [], kingdom: 'wei' }),
        player('c', 3, '刘备', { handCards: ['桃'], kingdom: 'shu' }),
      ],
    });
    engine.getDeck().stackTop(['闪']);

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 4,
      damageCardName: '杀',
    });

    let prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'dying_rescue', playerId: 'a' });
    await engine.submitPromptChoice('a', prompt.id, 'pass');

    prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'dying_rescue', playerId: 'b' });
    await engine.submitPromptChoice('b', prompt.id, 'pass');

    prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'dying_rescue', playerId: 'c' });
    await engine.submitPromptChoice('c', prompt.id, 'card:桃');

    prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:jianxiong');

    await engine.submitPromptChoice('a', prompt.id, 'skill:jianxiong');

    const caoCao = engine.getState().players[0]!;
    expect(caoCao.hp).toBe(1);
    expect(caoCao.handCards).toContain('杀');
    expect(caoCao.handCards.some((card) => card.includes('【闪】'))).toBe(true);
    expect(caoCao.skillUseCount.jianxiong).toBe(1);
    expect(engine.getState().log).toContain('界曹操 获得伤害牌【杀】');
  });

  it('界曹操濒死未被救回时不发动奸雄', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界曹操', { hp: 4, handCards: [] }),
        player('b', 2, '关羽', { handCards: [] }),
      ],
    });

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 4,
      damageCardName: '杀',
    });

    while (engine.getState().prompt?.type === 'dying_rescue') {
      const dyingPrompt = engine.getState().prompt!;
      await engine.submitPromptChoice(dyingPrompt.playerId, dyingPrompt.id, 'pass');
    }

    const caoCao = engine.getState().players[0]!;
    expect(caoCao.dead).toBe(true);
    expect(engine.getState().prompt).toBeNull();
    expect(caoCao.skillUseCount.jianxiong ?? 0).toBe(0);
    expect(engine.getState().log).not.toContain('奸雄');
  });

  it('界司马懿受到伤害后可发动反馈，获得伤害来源一张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界司马懿', { hp: 3, maxHp: 3, handCards: [] }),
        player('b', 2, '关羽', { handCards: ['♠7【杀】'] }),
      ],
    });

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 1,
      damageCardName: '杀',
    });

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:fankui');

    await engine.submitPromptChoice('a', prompt.id, 'skill:fankui');

    const siMaYi = engine.getState().players[0]!;
    const source = engine.getState().players[1]!;
    expect(siMaYi.hp).toBe(2);
    expect(siMaYi.handCards).toEqual(['♠7【杀】']);
    expect(source.handCards).toEqual([]);
    expect(siMaYi.skillUseCount.fankui).toBe(1);
    expect(engine.getState().log).toContain('界司马懿 获得 关羽 的一张手牌');
  });

  it('界郭嘉受到伤害后可发动遗计，摸两张并分配至多两张给其他角色', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界郭嘉', { hp: 3, maxHp: 3, handCards: ['♠5【闪】'] }),
        player('b', 2, '关羽', { handCards: [] }),
        player('c', 3, '张飞', { handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['杀', '桃']);

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 1,
      damageCardName: '杀',
    });

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:yiji');

    await expect(engine.submitPromptChoice('a', prompt.id, 'skill:yiji')).resolves.toMatchObject({
      ok: true,
    });

    const yijiPrompt = engine.getState().prompt!;
    expect(yijiPrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'yiji',
      skillAction: 'give_cards',
      validTargetIds: ['b', 'c'],
      discardCount: 2,
    });
    const guoJiaHandAfterDraw = engine.getState().players[0]!.handCards;
    expect(guoJiaHandAfterDraw[0]).toBe('♠5【闪】');
    expect(guoJiaHandAfterDraw[1]).toContain('【杀】');
    expect(guoJiaHandAfterDraw[2]).toContain('【桃】');
    const drawnSha = guoJiaHandAfterDraw[1]!;
    const drawnTao = guoJiaHandAfterDraw[2]!;

    expect(engine.rendeGive('a', 'b', [drawnSha], [1])).toMatchObject({ ok: true });
    const nextPrompt = engine.getState().prompt!;
    expect(nextPrompt).toMatchObject({
      type: 'use_skill',
      skillId: 'yiji',
      validTargetIds: ['c'],
      discardCount: 1,
    });
    expect(engine.rendeGive('a', 'b', [drawnTao], [1])).toMatchObject({
      ok: false,
      error: '目标不合法',
    });

    expect(engine.rendeGive('a', 'c', [drawnTao], [1])).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({ skillId: 'yiji', discardCount: 0 });

    await expect(
      engine.submitPromptChoice('a', engine.getState().prompt!.id, 'yiji:finish'),
    ).resolves.toMatchObject({ ok: true });

    const state = engine.getState();
    expect(state.players[0]!.hp).toBe(2);
    expect(state.players[0]!.handCards).toEqual(['♠5【闪】']);
    expect(state.players[1]!.handCards).toEqual([drawnSha]);
    expect(state.players[2]!.handCards).toEqual([drawnTao]);
    expect(state.players[0]!.skillUseCount.yiji).toBe(1);
    expect(state.resolution.context.yijiPending).toBeUndefined();
    expect(state.resolution.stack).toEqual([]);
    expect(state.prompt).toBeNull();
  });

  it('界夏侯惇发动刚烈，红判对伤害来源造成 1 点伤害', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界夏侯惇', { hp: 4, handCards: [] }),
        player('b', 2, '关羽', { hp: 4, handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['♥2【闪】']);

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 1,
      damageCardName: '杀',
    });
    const prompt = engine.getState().prompt!;

    await engine.submitPromptChoice('a', prompt.id, 'skill:ganglie');

    expect(engine.getState().players[0]!.hp).toBe(3);
    expect(engine.getState().players[1]!.hp).toBe(3);
    expect(engine.snapshot().discardPile).toContain('闪');
    expect(engine.getState().log).toContain('界夏侯惇 判定：♥2【闪】');
    expect(engine.getState().log).toContain('关羽 受到 1 点伤害（3/4）');
  });

  it('界夏侯惇发动刚烈，黑判弃置伤害来源一张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界夏侯惇', { hp: 4, handCards: [] }),
        player('b', 2, '关羽', { hp: 4, handCards: ['♣5【杀】'] }),
      ],
    });
    engine.getDeck().stackTop(['♠9【闪】']);

    await engine.applyDamage({
      sourceId: 'b',
      targetId: 'a',
      amount: 1,
      damageCardName: '杀',
    });
    const prompt = engine.getState().prompt!;

    await engine.submitPromptChoice('a', prompt.id, 'skill:ganglie');

    const pickPrompt = engine.getState().prompt!;
    expect(pickPrompt).toMatchObject({
      type: 'select_zone_card',
      playerId: 'a',
      skillId: 'ganglie',
    });
    await expect(engine.submitZoneCard('a', pickPrompt.id, 'hand:0')).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[0]!.hp).toBe(3);
    expect(engine.getState().players[1]!.hp).toBe(4);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.snapshot().discardPile).toEqual(expect.arrayContaining(['闪', '杀']));
    expect(engine.getState().log).toContain('界夏侯惇 判定：♠9【闪】');
    expect(engine.getState().log).toContain('界夏侯惇 弃置 关羽 的♣5【杀】');
    expect(engine.getState().log).not.toContain('关羽 弃置手牌');
    expect(engine.getState().log).not.toContain('获得 关羽');
  });

  it('闪电判定未生效后移入下一名存活角色判定区', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', { judgeCards: ['闪电'] }),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });

    engine.getDeck().stackTop(['♥5【杀】', '大宛', '闪']);
    engine.getState().turn.index = 0;
    engine.startJudgePhase();

    expect(engine.getState().players[0]!.judgeCards).toEqual([]);
    expect(engine.getState().players[1]!.judgeCards).toEqual(['闪电']);
    expect(engine.getState().players[0]!.hp).toBe(4);
    expect(engine.getState().log).toContain('【闪电】未生效，移入 关羽 的判定区');
  });

  it('闪电判定生效时造成 3 点雷电伤害且不转移', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', { judgeCards: ['闪电'] }),
        player('b', 2, '关羽'),
      ],
    });

    engine.getDeck().stackTop(['♠5【杀】']);
    engine.getState().turn.index = 0;
    engine.startJudgePhase();

    expect(engine.getState().players[0]!.judgeCards).toEqual([]);
    expect(engine.getState().players[1]!.judgeCards).toEqual([]);
    expect(engine.getState().players[0]!.hp).toBe(1);
    expect(engine.getState().log).toContain('【闪电】生效');
  });

  it('界郭嘉天妒在判定牌生效后获得判定牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界郭嘉', { maxHp: 3, hp: 3, judgeCards: ['乐不思蜀'] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['♠5【杀】']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();

    const guoJia = engine.getState().players[0]!;
    expect(guoJia.judgeCards).toEqual([]);
    expect(guoJia.handCards).toContain('♠5【杀】');
    expect(guoJia.skillUseCount.tiandu).toBe(1);
    expect(engine.snapshot().discardPile).not.toContain('杀');
    expect(engine.getState().log).toContain('界郭嘉 发动【天妒】，获得判定牌 ♠5【杀】');
  });

  it('鬼才改判按手牌条目匹配，日志与判定结果一致', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界司马懿', { maxHp: 3, hp: 3, judgeCards: ['乐不思蜀'] }),
        player('b', 2, '界司马懿', {
          maxHp: 3,
          hp: 3,
          handCards: ['♠6【闪】', '♦8【闪】', '♠1【桃】'],
        }),
      ],
    });
    engine.getDeck().stackTop(['♠9【决斗】']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();
    const prompt = engine.getState().prompt!;
    expect(prompt.modifyHandCards).toEqual(['♠6【闪】', '♦8【闪】', '♠1【桃】']);

    expect(engine.submitModifyJudge('b', prompt.id, 0, '♦8【闪】')).toMatchObject({ ok: true });

    expect(engine.getState().log).toContain(
      '界司马懿 发动【鬼才】，以 ♦8【闪】 代替判定结果',
    );
    const siMaYiHand = engine.getState().players[1]!.handCards;
    expect(siMaYiHand).toContain('♠6【闪】');
    expect(siMaYiHand).not.toContain('♦8【闪】');
    expect(engine.getState().turn.phase).toBe('play');
  });

  it('界郭嘉被鬼才改判后，天妒获得替换后的判定牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界郭嘉', { maxHp: 3, hp: 3, judgeCards: ['乐不思蜀'] }),
        player('b', 2, '界司马懿', { maxHp: 3, hp: 3, handCards: ['♥2【闪】'] }),
      ],
    });
    engine.getDeck().stackTop(['♠5【杀】']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();
    const prompt = engine.getState().prompt!;

    expect(engine.submitModifyJudge('b', prompt.id, 0)).toMatchObject({ ok: true });

    const guoJia = engine.getState().players[0]!;
    expect(guoJia.handCards).toContain('♥2【闪】');
    expect(guoJia.handCards).not.toContain('♠5【杀】');
    expect(guoJia.skillUseCount.tiandu).toBe(1);
    expect(engine.snapshot().discardPile).toContain('杀');
    expect(engine.snapshot().discardPile).not.toContain('闪');
    expect(engine.getState().log).toContain('界郭嘉 发动【天妒】，获得判定牌 ♥2【闪】');
    expect(engine.getState().log).toContain('界司马懿 发动【鬼才】，以 ♥2【闪】 代替判定结果');
  });

  it('多名角色可按座次依次选择是否发动鬼才改判', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', { judgeCards: ['乐不思蜀'] }),
        player('b', 2, '界司马懿', { maxHp: 3, hp: 3, handCards: ['♥2【闪】'] }),
        player('c', 3, '界司马懿', { maxHp: 3, hp: 3, handCards: ['♦9【桃】'] }),
      ],
    });
    engine.getDeck().stackTop(['♠5【杀】']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();

    const firstPrompt = engine.getState().prompt!;
    expect(firstPrompt).toMatchObject({ type: 'modify_judge', playerId: 'b' });
    expect(engine.skipModifyJudge('b', firstPrompt.id)).toMatchObject({ ok: true });

    const secondPrompt = engine.getState().prompt!;
    expect(secondPrompt).toMatchObject({ type: 'modify_judge', playerId: 'c' });
    expect(engine.submitModifyJudge('c', secondPrompt.id, 0)).toMatchObject({ ok: true });

    expect(engine.getState().players[0]!.judgeCards).toEqual([]);
    expect(engine.getState().turn.phase).toBe('play');
    expect(engine.getState().players[1]!.handCards).toContain('♥2【闪】');
    expect(engine.getState().players[2]!.handCards).toEqual([]);
    expect(engine.getDeck().discardPile()).toEqual(expect.arrayContaining(['杀', '桃']));
  });

  it('诸葛亮可发动观星调整牌堆顶并按调整结果摸牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '诸葛亮', { hp: 3, maxHp: 3, handCards: [] }),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪', '桃']);
    engine.getState().turn.index = 0;

    engine.beginTurnForTest();
    const offerPrompt = engine.getState().prompt!;
    expect(offerPrompt.options?.map((option) => option.id)).toContain('skill:guanxing');

    await engine.submitPromptChoice('a', offerPrompt.id, 'skill:guanxing');
    const guanxingPrompt = engine.getState().prompt!;
    expect(guanxingPrompt).toMatchObject({ skillId: 'guanxing', playerId: 'a' });
    expect(guanxingPrompt.guanxingCards).toHaveLength(3);

    await engine.submitPromptChoice('a', guanxingPrompt.id, 'guanxing:confirm:2:1,0,2');

    const zhugeLiang = engine.getState().players[0]!;
    expect(zhugeLiang.handCards).toHaveLength(2);
    expect(zhugeLiang.handCards[0]).toContain('【闪】');
    expect(zhugeLiang.handCards[1]).toContain('【杀】');
    expect(zhugeLiang.skillUseCount.guanxing).toBe(1);
    expect(engine.getState().turn.phase).toBe('play');
  });

  it('界李典发动恂恂后按调整结果摸牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界李典', { hp: 3, maxHp: 3, handCards: [] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪', '桃', '酒']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();
    const offerPrompt = engine.getState().prompt!;
    expect(offerPrompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(offerPrompt.options?.map((option) => option.id)).toContain('skill:xunxun');

    await engine.submitPromptChoice('a', offerPrompt.id, 'skill:xunxun');
    const xunxunPrompt = engine.getState().prompt!;
    expect(xunxunPrompt).toMatchObject({ skillId: 'xunxun', playerId: 'a' });
    expect(xunxunPrompt.guanxingCards).toHaveLength(4);

    await engine.submitPromptChoice('a', xunxunPrompt.id, 'xunxun:confirm:2:2,3,0,1');

    const liDian = engine.getState().players[0]!;
    expect(liDian.handCards).toHaveLength(2);
    expect(liDian.handCards[0]).toContain('【桃】');
    expect(liDian.handCards[1]).toContain('【酒】');
    expect(liDian.skillUseCount.xunxun).toBe(1);
    expect(engine.getState().turn.phase).toBe('play');
  });

  it('界张辽发动突袭获得至多两名其他角色手牌并少摸等量牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界张辽', { handCards: [] }),
        player('b', 2, '关羽', { handCards: ['♠7【杀】'] }),
        player('c', 3, '张飞', { handCards: ['♥8【闪】'] }),
      ],
    });
    engine.getDeck().stackTop(['桃', '酒']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();
    const prompt = engine.getState().prompt!;
    expect(prompt.options?.map((option) => option.id)).toContain('skill:tuxi');

    await engine.submitPromptChoice('a', prompt.id, 'skill:tuxi');

    const zhangLiao = engine.getState().players[0]!;
    expect(zhangLiao.handCards).toEqual(expect.arrayContaining(['♠7【杀】', '♥8【闪】']));
    expect(zhangLiao.handCards).toHaveLength(2);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().players[2]!.handCards).toEqual([]);
    expect(zhangLiao.skillUseCount.tuxi).toBe(1);
    expect(engine.getState().turn.phase).toBe('play');
  });

  it('界许褚发动裸衣跳过摸牌，获得亮出的基本牌/武器/决斗并记录伤害加成', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界许褚', { handCards: [] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['杀', '诸葛连弩', '无中生有']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();
    const prompt = engine.getState().prompt!;
    expect(prompt.options?.map((option) => option.id)).toContain('skill:luoyi');

    await engine.submitPromptChoice('a', prompt.id, 'skill:luoyi');

    const xuChu = engine.getState().players[0]!;
    expect(xuChu.handCards.some((card) => card.includes('【杀】'))).toBe(true);
    expect(xuChu.handCards.some((card) => card.includes('【诸葛连弩】'))).toBe(true);
    expect(xuChu.handCards.some((card) => card.includes('【无中生有】'))).toBe(false);
    expect(xuChu.skillUseCount.luoyi).toBe(1);
    expect(xuChu.skillUseCount._luoyi_damage_plus).toBe(1);
    expect(engine.getState().turn.phase).toBe('play');
  });

  it('界周瑜英姿摸牌阶段额外摸一张，手牌上限按体力上限计算', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界周瑜', {
          hp: 1,
          maxHp: 3,
          handCards: ['杀', '闪', '桃'],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪', '桃']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();

    const zhouYu = engine.getState().players[0]!;
    expect(zhouYu.handCards).toHaveLength(6);
    expect(engine.getState().turn.phase).toBe('play');

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
      discardCount: 3,
    });
  });

  it('孙权制衡可弃置任意张手牌并摸等量牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '孙权', { handCards: ['♠7【杀】', '♥8【闪】', '♦9【桃】'] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['无中生有', '顺手牵羊']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiateSkill('a', 'zhiheng')).toMatchObject({ ok: true });
    expect(engine.zhihengConfirm('a', [0, 2])).toMatchObject({ ok: true });

    const sunQuan = engine.getState().players[0]!;
    expect(sunQuan.handCards).toHaveLength(3);
    expect(sunQuan.handCards).toContain('♥8【闪】');
    expect(sunQuan.handCards.some((card) => card.includes('【无中生有】'))).toBe(true);
    expect(sunQuan.handCards.some((card) => card.includes('【顺手牵羊】'))).toBe(true);
    expect(sunQuan.skillUseCount.zhiheng).toBe(1);
    expect(engine.getDeck().discardPile()).toEqual(expect.arrayContaining(['杀', '桃']));
  });

  it('闪电未生效移走时，界郭嘉天妒不获得判定牌', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界郭嘉', { maxHp: 3, hp: 3, judgeCards: ['闪电'] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['♥5【杀】']);
    engine.getState().turn.index = 0;

    engine.startJudgePhase();

    const guoJia = engine.getState().players[0]!;
    expect(guoJia.handCards).not.toContain('♥5【杀】');
    expect(guoJia.skillUseCount.tiandu).toBeUndefined();
    expect(engine.getState().players[1]!.judgeCards).toEqual(['闪电']);
    expect(engine.snapshot().discardPile).toContain('杀');
  });

  it('甄姬发动洛神，黑色判定牌获得后可继续，红色判定停止并进入判定阶段', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '甄姬', { maxHp: 3, hp: 3, handCards: [] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['♣7【杀】', '♠9【闪】', '♥2【桃】']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'prepare';

    engine.beginTurnForTest();
    const firstPrompt = engine.getState().prompt!;
    expect(firstPrompt.options?.map((option) => option.id)).toContain('skill:luoshen');

    await engine.submitPromptChoice('a', firstPrompt.id, 'skill:luoshen');
    const secondPrompt = engine.getState().prompt!;
    expect(engine.getState().players[0]!.handCards).toEqual(['♣7【杀】']);
    expect(secondPrompt).toMatchObject({ skillId: 'luoshen', playerId: 'a' });
    expect(secondPrompt.options?.map((option) => option.id)).toEqual([
      'luoshen:continue',
      'luoshen:stop',
    ]);

    await engine.submitPromptChoice('a', secondPrompt.id, 'luoshen:continue');
    const thirdPrompt = engine.getState().prompt!;
    expect(engine.getState().players[0]!.handCards).toEqual(['♣7【杀】', '♠9【闪】']);
    expect(thirdPrompt).toMatchObject({ skillId: 'luoshen', playerId: 'a' });

    await engine.submitPromptChoice('a', thirdPrompt.id, 'luoshen:continue');

    const zhenJi = engine.getState().players[0]!;
    expect(zhenJi.handCards.slice(0, 2)).toEqual(['♣7【杀】', '♠9【闪】']);
    expect(zhenJi.handCards).not.toContain('♥2【桃】');
    expect(zhenJi.skillUseCount.luoshen).toBe(3);
    expect(engine.snapshot().discardPile).toContain('桃');
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().turn.phase).toBe('play');
    expect(engine.getState().log).toEqual(
      expect.arrayContaining([
        '甄姬 发动【洛神】，判定：♣7【杀】',
        '甄姬 发动【洛神】，判定：♠9【闪】',
        '甄姬 发动【洛神】，判定：♥2【桃】',
      ]),
    );
  });

  it('甄姬洛神黑判后可主动停止并进入判定阶段', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '甄姬', { maxHp: 3, hp: 3, handCards: [], judgeCards: ['乐不思蜀'] }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['♠6【闪】', '♠5【杀】']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'prepare';

    engine.beginTurnForTest();
    const firstPrompt = engine.getState().prompt!;
    await engine.submitPromptChoice('a', firstPrompt.id, 'skill:luoshen');
    const continuePrompt = engine.getState().prompt!;

    await engine.submitPromptChoice('a', continuePrompt.id, 'luoshen:stop');

    const zhenJi = engine.getState().players[0]!;
    expect(zhenJi.handCards[0]).toBe('♠6【闪】');
    expect(zhenJi.judgeCards).toEqual([]);
    expect(engine.getState().turn.phase).toBe('play');
    expect(engine.getState().log).toContain('甄姬 判定【乐不思蜀】：♠5【杀】 → 生效（跳过出牌阶段）');
  });

  it('替身在准备阶段回复至上回合结束体力并摸等量牌，之后不可再次发动', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '张飞', { hp: 2, lastTurnEndHp: 4, judgeCards: ['兵粮寸断'] }),
        player('b', 2, '关羽'),
      ],
    });

    engine.getDeck().stackTop(['杀', '闪', '♥5【杀】']);
    engine.getState().turn.phase = 'prepare';
    engine.getState().players[0]!.usedLimitedSkills = {};
    engine.getState().players[0]!.hp = 2;
    engine.getState().players[0]!.handCards = [];
    engine.getState().players[0]!.lastTurnEndHp = 4;

    // 直接模拟准备阶段询问：beginTurn 会进入 processPreparePhase。
    engine.getState().turn.index = 0;
    engine.beginTurnForTest();

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:tishen');

    await engine.submitPromptChoice('a', prompt.id, 'skill:tishen');

    const zhangFei = engine.getState().players[0]!;
    expect(zhangFei.hp).toBe(4);
    expect(zhangFei.handCards).toHaveLength(2);
    expect(zhangFei.usedLimitedSkills?.tishen).toBe(true);

    zhangFei.hp = 2;
    zhangFei.lastTurnEndHp = 4;
    engine.getState().turn.phase = 'prepare';
    engine.beginTurnForTest();

    expect(engine.getState().prompt?.options?.map((option) => option.id) ?? []).not.toContain(
      'skill:tishen',
    );
  });

  it('界吕蒙本回合未使用杀时可发动克己跳过弃牌阶段', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕蒙', {
          hp: 2,
          maxHp: 4,
          handCards: ['杀', '闪', '桃', '酒'],
          shaUsedCount: 0,
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:keji');

    await engine.submitPromptChoice('a', prompt.id, 'skill:keji');

    const lvMeng = engine.getState().players[0]!;
    expect(lvMeng.handCards).toHaveLength(4);
    expect(lvMeng.skillUseCount.keji).toBe(1);
    expect(engine.getState().turn.index).toBe(1);
    expect(engine.getState().log).toContain('界吕蒙 发动【克己】，跳过弃牌阶段');
  });

  it('界吕蒙本回合使用过杀时不能发动克己，但仍可选择勤学', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕蒙', {
          hp: 2,
          maxHp: 4,
          handCards: ['杀', '闪', '桃', '酒'],
          shaUsedCount: 1,
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'a',
    });
    expect(engine.getState().prompt?.options?.map((option) => option.id)).not.toContain(
      'skill:keji',
    );
    expect(engine.getState().prompt?.options?.map((option) => option.id)).toContain(
      'skill:qinxue',
    );
  });

  it('界吕蒙弃牌阶段可发动勤学，弃一张手牌并摸两张牌后继续弃牌检查', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕蒙', {
          hp: 4,
          maxHp: 4,
          handCards: ['♠7【杀】', '♥8【闪】', '桃', '酒'],
          shaUsedCount: 1,
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:qinxue');
    expect(prompt.options?.map((option) => option.id)).not.toContain('skill:keji');

    await engine.submitPromptChoice('a', prompt.id, 'qinxue:0');

    const lvMeng = engine.getState().players[0]!;
    expect(lvMeng.skillUseCount.qinxue).toBe(1);
    expect(lvMeng.handCards).toHaveLength(5);
    expect(lvMeng.handCards.some((card) => card.includes('【杀】'))).toBe(true);
    expect(lvMeng.handCards.some((card) => card.includes('【闪】'))).toBe(true);
    expect(engine.snapshot().discardPile).toContain('杀');
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
      discardCount: 1,
    });
    expect(engine.getState().log).toContain(
      '界吕蒙 发动【勤学】，弃置 ♠7【杀】 并摸 2 张牌',
    );
  });

  it('勤学记录两种花色后，下回合使用杀次数 +1', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕蒙', {
          hp: 4,
          maxHp: 4,
          handCards: ['♥8【闪】'],
          skillTargetUseCount: { _qinxue_suits: ['♠'] },
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪', '桃', '酒']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'discard';
    engine.getState().prompt = {
      id: 'qinxue-test',
      type: 'use_skill',
      playerId: 'a',
      message: '弃牌阶段：是否发动技能？',
      options: [{ id: 'skill:qinxue', label: '发动【勤学】' }],
    };

    await engine.submitPromptChoice('a', 'qinxue-test', 'qinxue:0');

    const lvMeng = engine.getState().players[0]!;
    expect(lvMeng.skillUseCount._qinxue_sha_bonus).toBe(1);
  });

  it('界貂蝉结束阶段可发动闭月，有手牌时摸一张后进入弃牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界貂蝉', {
          hp: 3,
          maxHp: 3,
          handCards: ['杀', '闪', '桃'],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['酒']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a' });
    expect(prompt.options?.map((option) => option.id)).toContain('skill:biyue');

    await engine.submitPromptChoice('a', prompt.id, 'skill:biyue');

    const diaochan = engine.getState().players[0]!;
    expect(diaochan.handCards).toHaveLength(4);
    expect(diaochan.handCards.some((card) => card.includes('【酒】'))).toBe(true);
    expect(diaochan.skillUseCount.biyue).toBe(1);
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
      discardCount: 1,
    });
    expect(engine.getState().log).toContain('界貂蝉 发动【闭月】，摸 1 张牌');
  });

  it('界貂蝉无手牌发动闭月时改为摸两张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界貂蝉', {
          hp: 3,
          maxHp: 3,
          handCards: [],
        }),
        player('b', 2, '关羽'),
      ],
    });
    engine.getDeck().stackTop(['酒', '桃']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    await engine.submitPromptChoice('a', prompt.id, 'skill:biyue');

    const diaochan = engine.getState().players[0]!;
    expect(diaochan.handCards).toHaveLength(2);
    expect(engine.getState().turn.index).toBe(1);
    expect(engine.getState().log).toContain('界貂蝉 发动【闭月】，摸 2 张牌');
  });

  it('华雄受到红色杀伤害时，耀武令伤害来源回复体力', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 3, maxHp: 4 }),
        player('b', 2, '华雄', { hp: 6, maxHp: 6 }),
      ],
    });

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♥7【杀】',
    });

    expect(engine.getState().players[0]!.hp).toBe(4);
    expect(engine.getState().players[1]!.hp).toBe(5);
    expect(engine.getState().log).toContain(
      '华雄 触发【耀武】，关羽 回复 1 点体力（4/4）',
    );
  });

  it('华雄受到红色杀伤害且来源满体力时，耀武令伤害来源摸一张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4, handCards: [] }),
        player('b', 2, '华雄', { hp: 6, maxHp: 6 }),
      ],
    });
    engine.getDeck().stackTop(['♣8【桃】']);

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♦7【杀】',
    });

    expect(engine.getState().players[0]!.handCards[0]).toContain('【桃】');
    expect(engine.getState().players[1]!.hp).toBe(5);
    expect(engine.getState().log).toContain('华雄 触发【耀武】，关羽 摸 1 张牌');
  });

  it('华雄受到非红色杀伤害时，耀武令华雄摸一张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4 }),
        player('b', 2, '华雄', { hp: 6, maxHp: 6, handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['闪']);

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '♠7【杀】',
    });

    expect(engine.getState().players[1]!.handCards[0]).toContain('【闪】');
    expect(engine.getState().players[1]!.hp).toBe(5);
    expect(engine.getState().log).toContain('华雄 触发【耀武】，摸 1 张牌');
  });

  it('界华佗回合外可用红色牌发动急救救助濒死角色', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 1, maxHp: 4 }),
        player('b', 2, '界华佗', { hp: 3, maxHp: 3, handCards: ['♥3【杀】'] }),
      ],
    });

    await engine.applyDamage({ sourceId: 'b', targetId: 'a', amount: 1 });

    const selfPrompt = engine.getState().prompt;
    expect(selfPrompt).toMatchObject({ type: 'dying_rescue', playerId: 'a' });
    await engine.submitPromptChoice('a', selfPrompt!.id, 'pass');

    const prompt = engine.getState().prompt;
    expect(prompt).toMatchObject({ type: 'dying_rescue', playerId: 'b' });
    expect(prompt?.validResponseCards).toContain('♥3【杀】');

    const result = await engine.submitPromptChoice('b', prompt!.id, 'card:♥3【杀】');

    expect(result.ok).toBe(true);
    expect(engine.getState().players[0]!.hp).toBe(1);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().log).toContain('界华佗 对 关羽 使用【桃（急救）】（1/4）');
  });

  it('界华佗自己回合内不能用急救转化红色牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界华佗', { hp: 3, maxHp: 3, handCards: ['♥3【杀】'] }),
        player('b', 2, '关羽', { hp: 1, maxHp: 4 }),
      ],
    });

    await engine.applyDamage({ sourceId: 'a', targetId: 'b', amount: 1 });

    const prompt = engine.getState().prompt;
    expect(prompt).toMatchObject({ type: 'dying_rescue', playerId: 'a' });
    expect(prompt?.validResponseCards).not.toContain('♥3【杀】');
  });

  it('孙权可发动救援令吴势力角色代出桃救助主公', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '孙权', {
          role: '主公',
          roleRevealed: true,
          kingdom: 'wu',
          hp: 1,
          maxHp: 4,
          handCards: [],
        }),
        player('b', 2, '界周瑜', {
          role: '忠臣',
          kingdom: 'wu',
          hp: 3,
          maxHp: 3,
          handCards: ['桃'],
        }),
      ],
    });

    await engine.applyDamage({ sourceId: 'b', targetId: 'a', amount: 1 });

    const selfPrompt = engine.getState().prompt;
    expect(selfPrompt).toMatchObject({ type: 'dying_rescue', playerId: 'a' });
    await expect(engine.submitPromptChoice('a', selfPrompt!.id, 'pass')).resolves.toMatchObject({ ok: true });

    const prompt = engine.getState().prompt;
    expect(prompt).toMatchObject({
      type: 'dying_rescue',
      playerId: 'b',
      dyingPlayerId: 'a',
    });
    expect(prompt?.validResponseCards).toHaveLength(1);
    const taoEntry = prompt!.validResponseCards![0]!;
    expect(taoEntry).toContain('【桃】');

    await expect(engine.submitPromptChoice('b', prompt!.id, `card:${taoEntry}`)).resolves.toMatchObject({ ok: true });

    const lord = engine.getState().players[0]!;
    expect(lord.hp).toBe(1);
    expect(lord.skillUseCount.jiuyuan).toBe(1);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log).toContain('界周瑜 响应【救援】，替 孙权 打出【桃】（1/4）');
  });

  it('界赵云回合外打出手牌后可发动涯角将同类别展示牌交给一名角色', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4, handCards: ['杀'] }),
        player('b', 2, '界赵云', { hp: 4, maxHp: 4, handCards: ['闪'] }),
        player('c', 3, '孙权', { hp: 4, maxHp: 4, handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['♣8【桃】']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    await playCardToTargets(engine, 'a', '杀', ['b']);
    const responsePrompt = engine.getState().prompt!;

    await expect(engine.submitPromptChoice('b', responsePrompt.id, 'card:闪')).resolves.toMatchObject({ ok: true });

    const yajiaoPrompt = engine.getState().prompt;
    expect(yajiaoPrompt).toMatchObject({
      type: 'assign_revealed',
      playerId: 'b',
      skillId: 'yajiao',
    });
    expect(yajiaoPrompt?.validTargetIds).toEqual(['a', 'b', 'c']);

    await expect(engine.submitPromptChoice('b', yajiaoPrompt!.id, 'target:c')).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.skillUseCount.yajiao).toBe(1);
    expect(engine.getState().players[2]!.handCards[0]).toContain('【桃】');
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log).toContain('界赵云 将【涯角】展示牌 ♣8【桃】 交给 孙权');
  });

  it('界赵云涯角展示牌类别不同时置入弃牌堆且不弹目标选择', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4, handCards: ['杀'] }),
        player('b', 2, '界赵云', { hp: 4, maxHp: 4, handCards: ['闪'] }),
      ],
    });
    engine.getDeck().stackTop(['♠3【顺手牵羊】']);
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    await playCardToTargets(engine, 'a', '杀', ['b']);
    const responsePrompt = engine.getState().prompt!;

    await expect(engine.submitPromptChoice('b', responsePrompt.id, 'card:闪')).resolves.toMatchObject({ ok: true });

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getDeck().discardPile()).toContain('顺手牵羊');
    expect(engine.getState().log).toContain('界赵云 发动【涯角】，展示 ♠3【顺手牵羊】，类别不同，置入弃牌堆');
  });

  it('袁术在主公准备阶段可发动妄尊，摸一张并令主公本回合手牌上限 -1', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界刘备', {
          role: '主公',
          roleRevealed: true,
          hp: 4,
          maxHp: 4,
          handCards: ['杀', '闪', '桃', '酒'],
        }),
        player('b', 2, '袁术', { role: '反贼', handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['顺手牵羊', '杀', '闪']);
    engine.getState().turn.index = 0;

    engine.beginTurnForTest();

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'wangzun',
    });
    expect(prompt.message).toContain('准备阶段：是否发动【妄尊】');

    const result = await engine.submitPromptChoice('b', prompt.id, 'skill:wangzun');

    expect(result.ok).toBe(true);
    const lord = engine.getState().players[0]!;
    const yuanShu = engine.getState().players[1]!;
    expect(yuanShu.handCards).toHaveLength(1);
    expect(yuanShu.handCards[0]).toContain('【顺手牵羊】');
    expect(yuanShu.skillUseCount.wangzun).toBe(1);
    expect(lord.skillUseCount._wangzun_hand_limit_minus).toBe(1);
    expect(engine.getState().turn.phase).toBe('play');

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
      discardCount: 3,
    });
    expect(engine.getState().log).toContain(
      '袁术 发动【妄尊】，摸 1 张牌，界刘备 本回合手牌上限 -1',
    );
  });

  it('袁术跳过妄尊时不摸牌且不减少主公手牌上限', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界刘备', {
          role: '主公',
          roleRevealed: true,
          hp: 4,
          maxHp: 4,
          handCards: ['杀', '闪', '桃', '酒'],
        }),
        player('b', 2, '袁术', { role: '反贼', handCards: [] }),
      ],
    });
    engine.getDeck().stackTop(['杀', '闪']);
    engine.getState().turn.index = 0;

    engine.beginTurnForTest();

    const prompt = engine.getState().prompt!;
    const result = await engine.submitPromptChoice('b', prompt.id, 'skip');

    expect(result.ok).toBe(true);
    expect(engine.getState().players[1]!.handCards).toHaveLength(0);
    expect(engine.getState().players[0]!.skillUseCount._wangzun_hand_limit_minus).toBeUndefined();
    expect(engine.getState().turn.phase).toBe('play');

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
      discardCount: 2,
    });
  });

  it('界徐庶在造成过伤害的其他角色结束阶段可发动诛害使用杀', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', {
          hp: 4,
          maxHp: 4,
          handCards: ['桃', '酒', '无懈可击', '顺手牵羊'],
        }),
        player('b', 2, '界徐庶', { hp: 4, maxHp: 4, handCards: ['杀'] }),
      ],
    });

    await engine.applyDamage({
      sourceId: 'a',
      targetId: 'b',
      amount: 1,
      damageCardName: '杀',
    });
    const selfPrompt = engine.getState().prompt;
    if (selfPrompt) {
      await engine.submitPromptChoice(selfPrompt.playerId, selfPrompt.id, 'skip');
    }

    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'zhuhai',
      sourcePlayerId: 'a',
    });

    await expect(
      engine.submitPromptChoice('b', prompt.id, 'skill:zhuhai'),
    ).resolves.toMatchObject({ ok: true });

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'a',
      cardName: '杀',
      sourcePlayerId: 'b',
    });
    expect(engine.getState().players[1]!.handCards).toHaveLength(0);
    expect(engine.getState().players[1]!.skillUseCount.zhuhai).toBe(1);

    await engine.submitPromptChoice('a', responsePrompt.id, 'pass');

    expect(engine.getState().players[0]!.hp).toBe(3);
    expect(engine.getState().prompt).toMatchObject({
      type: 'discard_cards',
      playerId: 'a',
    });
    expect(engine.getState().log).toContain(
      '界徐庶 发动【诛害】，对 关羽 使用【杀】',
    );
  });

  it('界徐庶可跳过诛害并继续当前角色结束流程', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4, handCards: [] }),
        player('b', 2, '界徐庶', { hp: 4, maxHp: 4, handCards: ['杀'] }),
      ],
    });

    await engine.applyDamage({ sourceId: 'a', targetId: 'b', amount: 1, damageCardName: '杀' });
    const selfPrompt = engine.getState().prompt;
    if (selfPrompt) {
      await engine.submitPromptChoice(selfPrompt.playerId, selfPrompt.id, 'skip');
    }
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    await engine.submitPromptChoice('b', prompt.id, 'skip');

    expect(engine.getState().players[0]!.hp).toBe(4);
    expect(engine.getState().players[1]!.handCards.some((card) => card.includes('【杀】'))).toBe(
      true,
    );
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().turn.index).toBe(1);
  });

  it('未造成过伤害的角色结束阶段不触发诛害询问', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '关羽', { hp: 4, maxHp: 4, handCards: [] }),
        player('b', 2, '界徐庶', { hp: 4, maxHp: 4, handCards: ['杀'] }),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.endTurn('a')).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().turn.index).toBe(1);
  });
});
