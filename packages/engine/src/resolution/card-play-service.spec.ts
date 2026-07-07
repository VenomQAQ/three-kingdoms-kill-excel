import { describe, expect, it } from 'vitest';
import { SangokushiEngine } from '../core/sangokushi-engine';
import type { EnginePlayerState } from '../types/game';

function player(
  id: string,
  seat: number,
  generalName: string,
  handCards: string[],
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
    handCards,
    equipment: [],
    judgeCards: [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
    usedLimitedSkills: {},
    lastTurnEndHp: 4,
    dead: false,
  };
}

function engineWithHands(sourceCard: string): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, '刘备', [sourceCard]),
      player('b', 2, '关羽', ['无懈可击']),
      player('c', 3, '张飞', []),
      player('d', 4, '赵云', []),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

function engineWithSourceGeneral(sourceCard: string, generalName: string): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, generalName, [sourceCard]),
      player('b', 2, '关羽', ['无懈可击']),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

function engineForLiuli(): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, '刘备', ['杀']),
      player('b', 2, '界大乔', ['闪']),
      player('c', 3, '张飞', []),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

function engineForTieqi(targetHand: string[]): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, '界马超', ['杀']),
      player('b', 2, '界华佗', targetHand),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

function engineForVirtualCard(sourceGeneral: string, handCards: string[]): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      player('a', 1, sourceGeneral, handCards),
      player('b', 2, '张飞', ['闪']),
    ],
  });
  engine.getState().turn.index = 0;
  engine.getState().turn.phase = 'play';
  return engine;
}

function engineForLordAssist(lordGeneral: string, lordKingdom: string, assistantGeneral: string, assistantKingdom: string): SangokushiEngine {
  const engine = new SangokushiEngine({
    players: [
      {
        ...player('a', 1, lordGeneral, []),
        role: '主公',
        roleRevealed: true,
        kingdom: lordKingdom,
      },
      player('b', 2, '张飞', ['杀']),
      { ...player('c', 3, assistantGeneral, ['闪']), kingdom: assistantKingdom },
    ],
  });
  engine.getState().turn.index = 1;
  engine.getState().turn.phase = 'play';
  return engine;
}

async function passWuxie(engine: SangokushiEngine): Promise<void> {
  const prompt = engine.getState().prompt!;
  expect(prompt).toMatchObject({ type: 'response', playerId: 'b' });
  await engine.submitPromptChoice('b', prompt.id, 'pass');
}

async function confirmSourceCard(engine: SangokushiEngine): Promise<void> {
  const confirm = engine.getState().prompt!;
  expect(confirm).toMatchObject({ type: 'play_card_confirm', playerId: 'a' });
  await engine.submitPromptChoice('a', confirm.id, 'confirm');
}

async function chooseTargets(engine: SangokushiEngine, targetIds: string[]): Promise<void> {
  const prompt = engine.getState().prompt!;
  expect(prompt).toMatchObject({ type: 'select_targets', playerId: 'a' });
  await expect(engine.selectTargets('a', prompt.id, targetIds)).resolves.toMatchObject({ ok: true });
}

async function chooseTargetsFor(engine: SangokushiEngine, playerId: string, targetIds: string[]): Promise<void> {
  const prompt = engine.getState().prompt!;
  expect(prompt).toMatchObject({ type: 'select_targets', playerId });
  await expect(engine.selectTargets(playerId, prompt.id, targetIds)).resolves.toMatchObject({ ok: true });
}

describe('CardPlayService trick resolution', () => {
  it('界关羽可显式将红色牌当杀使用', () => {
    const engine = engineForVirtualCard('界关羽', ['♥7【桃】']);

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '杀',
      validTargetIds: ['b'],
    });
    expect(engine.getState().log).toContain('界关羽 将 ♥7【桃】 当【杀】使用');
  });

  it('界甘宁可显式将黑色牌当过河拆桥使用', () => {
    const engine = engineForVirtualCard('界甘宁', ['♣7【闪】']);
    engine.getState().players[1]!.equipment = ['八卦阵'];

    expect(engine.initiatePlayCard('a', '过河拆桥', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '过河拆桥',
      validTargetIds: ['b'],
    });
    expect(engine.getState().log).toContain('界甘宁 将 ♣7【闪】 当【过河拆桥】使用');
  });

  it('界甘宁发动奇袭后先选黑色手牌再选择过河拆桥目标', async () => {
    const engine = engineForVirtualCard('界甘宁', ['♣7【闪】', '♥3【桃】']);
    engine.getState().players[1]!.equipment = ['八卦阵'];

    expect(engine.initiateSkill('a', 'qixi')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'qixi',
      skillAction: 'virtual_card_pick',
      cardName: '过河拆桥',
      discardHandIndices: [0],
    });

    await expect(engine.submitPromptChoice('a', engine.getState().prompt!.id, 'qixi:hand:0')).resolves.toMatchObject({
      ok: true,
    });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '过河拆桥',
      validTargetIds: ['b'],
    });
    expect(engine.getState().log).toContain('界甘宁 将 ♣7【闪】 当【过河拆桥】使用');
  });

  it('界大乔可显式将方块牌当乐不思蜀使用', () => {
    const engine = engineForVirtualCard('界大乔', ['♦7【闪】']);

    expect(engine.initiatePlayCard('a', '乐不思蜀', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '乐不思蜀',
      validTargetIds: ['b'],
    });
    expect(engine.getState().log).toContain('界大乔 将 ♦7【闪】 当【乐不思蜀】使用');
  });

  it('界张飞咆哮允许一回合内多次使用杀', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界张飞', ['杀', '杀']),
        player('b', 2, '关羽', []),
        player('c', 3, '赵云', []),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(engine.getState().players[0]!.shaUsedCount).toBe(1);
    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['c']);
    await engine.submitPromptChoice('c', engine.getState().prompt!.id, 'pass');

    expect(engine.getState().players[0]!.shaUsedCount).toBe(2);
    expect(engine.getState().players[1]!.hp).toBe(3);
    expect(engine.getState().players[2]!.hp).toBe(3);
  });

  it('无咆哮角色一回合内第二张杀会被次数限制拦截', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['杀', '杀']),
        player('b', 2, '关羽', []),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({
      ok: false,
      error: '本回合【杀】已用完',
    });
  });

  it('界吕布无双令杀目标需要连续打出两张闪', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布', ['杀']),
        player('b', 2, '关羽', ['闪', '闪']),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);

    const firstPrompt = engine.getState().prompt!;
    expect(firstPrompt).toMatchObject({ type: 'response', playerId: 'b', cardName: '杀' });
    expect(firstPrompt.message).toContain('需 2 张【闪】，已 0/2');
    await engine.submitPromptChoice('b', firstPrompt.id, `card:${firstPrompt.validResponseCards![0]}`);

    const secondPrompt = engine.getState().prompt!;
    expect(secondPrompt).toMatchObject({ type: 'response', playerId: 'b', cardName: '杀' });
    expect(secondPrompt.message).toContain('需 2 张【闪】，已 1/2');
    await engine.submitPromptChoice('b', secondPrompt.id, `card:${secondPrompt.validResponseCards![0]}`);

    expect(engine.getState().players[1]!.hp).toBe(4);
    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log).toContain('【杀】被抵消');
  });

  it('界吕布无双令决斗响应方需要连续打出两张杀', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界吕布', ['决斗']),
        player('b', 2, '关羽', ['杀', '杀']),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '决斗', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);

    const firstPrompt = engine.getState().prompt!;
    expect(firstPrompt).toMatchObject({ type: 'response', playerId: 'b', cardName: '决斗' });
    expect(firstPrompt.message).toContain('需 2 张【杀】，已 0/2');
    await engine.submitPromptChoice('b', firstPrompt.id, `card:${firstPrompt.validResponseCards![0]}`);

    const secondPrompt = engine.getState().prompt!;
    expect(secondPrompt).toMatchObject({ type: 'response', playerId: 'b', cardName: '决斗' });
    expect(secondPrompt.message).toContain('需 2 张【杀】，已 1/2');
    await engine.submitPromptChoice('b', secondPrompt.id, `card:${secondPrompt.validResponseCards![0]}`);

    const nextPrompt = engine.getState().prompt!;
    expect(nextPrompt).toMatchObject({ type: 'response', playerId: 'a', cardName: '决斗' });
    expect(engine.getState().players[1]!.handCards).toEqual([]);
  });

  it('诸葛亮无手牌时空城令其不能成为杀的目标', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['杀']),
        player('b', 2, '诸葛亮', []),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({
      ok: false,
      error: '没有合法的目标角色',
    });
  });

  it('诸葛亮无手牌时空城令其不能成为决斗的目标', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['决斗']),
        player('b', 2, '诸葛亮', []),
        player('c', 3, '张飞', []),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '决斗', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '决斗',
      validTargetIds: ['c'],
    });
  });

  it('非对应转化技不能把任意牌显式当杀使用', () => {
    const engine = engineForVirtualCard('刘备', ['♥7【桃】']);

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({
      ok: false,
      error: '此牌不能按指定方式使用',
    });
  });

  it('南蛮无懈全员不出后继续逐目标询问杀', async () => {
    const engine = engineWithHands('南蛮入侵');

    expect(engine.initiatePlayCard('a', '南蛮入侵').ok).toBe(true);
    const confirm = engine.getState().prompt!;
    expect(confirm).toMatchObject({
      type: 'play_card_confirm',
      playerId: 'a',
      cardName: '南蛮入侵',
    });

    await engine.submitPromptChoice('a', confirm.id, 'confirm');
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '南蛮入侵',
    });

    await engine.submitPromptChoice('b', prompt.id, 'pass');

    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '南蛮入侵',
    });
    expect(engine.getState().resolution.targetQueue).toEqual(['b', 'c', 'd']);

    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');
    expect(engine.getState().prompt).toMatchObject({ playerId: 'c', cardName: '南蛮入侵' });

    await engine.submitPromptChoice('c', engine.getState().prompt!.id, 'pass');
    expect(engine.getState().prompt).toMatchObject({ playerId: 'd', cardName: '南蛮入侵' });
  });

  it('万箭无懈全员不出后继续逐目标询问闪', async () => {
    const engine = engineWithHands('万箭齐发');

    expect(engine.initiatePlayCard('a', '万箭齐发').ok).toBe(true);
    await engine.submitPromptChoice('a', engine.getState().prompt!.id, 'confirm');
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '万箭齐发',
    });
    expect(engine.getState().resolution.targetQueue).toEqual(['b', 'c', 'd']);
  });

  it('界甘宁可发动奋威弃牌取消多目标锦囊对自己的影响', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['南蛮入侵']),
        player('b', 2, '界甘宁', ['闪']),
        player('c', 3, '张飞', []),
      ],
    });
    engine.getState().players[1]!.kingdom = 'wu';
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '南蛮入侵').ok).toBe(true);
    await engine.submitPromptChoice('a', engine.getState().prompt!.id, 'confirm');

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'fenwei',
      cardName: '南蛮入侵',
    });

    await expect(
      engine.submitPromptChoice('b', prompt.id, 'fenwei:skill:hand:0'),
    ).resolves.toMatchObject({ ok: true });

    expect(engine.getState().players[1]!.handCards).toEqual([]);
    expect(engine.getState().players[1]!.hp).toBe(4);
    expect(engine.getState().players[1]!.skillUseCount.fenwei).toBe(1);
    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'c',
      cardName: '南蛮入侵',
    });
    expect(engine.getState().resolution.targetQueue).toEqual(['c']);
    expect(engine.getState().log).toContain('界甘宁 发动【奋威】，取消【南蛮入侵】对自己的影响');
  });

  it('界甘宁跳过奋威后仍正常响应多目标锦囊', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['万箭齐发']),
        player('b', 2, '界甘宁', ['闪']),
        player('c', 3, '张飞', []),
      ],
    });
    engine.getState().players[1]!.kingdom = 'wu';
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '万箭齐发').ok).toBe(true);
    await engine.submitPromptChoice('a', engine.getState().prompt!.id, 'confirm');
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'b', skillId: 'fenwei' });

    await engine.submitPromptChoice('b', prompt.id, 'skip');

    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '万箭齐发',
    });
    expect(engine.getState().prompt?.validResponseCards).toHaveLength(1);
    expect(engine.getState().prompt?.validResponseCards?.[0]).toContain('【闪】');
    expect(engine.getState().resolution.targetQueue).toEqual(['b', 'c']);
  });

  it.each([
    ['决斗', { type: 'response', playerId: 'b', cardName: '决斗' }],
    ['借刀杀人', { type: 'response', playerId: 'b', cardName: '借刀杀人' }],
    ['五谷丰登', { type: 'pick_revealed', playerId: 'a', cardName: '五谷丰登' }],
  ])('%s 无懈全员不出后继续主体结算', async (cardName, expectedPrompt) => {
    const engine = engineWithHands(cardName);
    engine.getState().players[1]!.equipment = ['青龙偃月刀'];

    expect(engine.initiatePlayCard('a', cardName).ok).toBe(true);
    if (engine.getState().prompt?.type === 'select_targets') {
      const targets = cardName === '借刀杀人' ? ['b', 'c'] : ['b'];
      await chooseTargets(engine, targets);
    }
    if (engine.getState().prompt?.type === 'play_card_confirm') {
      await confirmSourceCard(engine);
    }
    await passWuxie(engine);

    expect(engine.getState().prompt).toMatchObject(expectedPrompt);
  });

  it('五谷丰登从出牌玩家开始依次选牌', async () => {
    const engine = engineWithHands('五谷丰登');

    expect(engine.initiatePlayCard('a', '五谷丰登').ok).toBe(true);
    await confirmSourceCard(engine);
    await passWuxie(engine);

    let prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'pick_revealed', playerId: 'a' });

    await engine.submitPromptChoice('a', prompt.id, 'revealed:0');
    prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'pick_revealed', playerId: 'b' });
  });

  it('桃园结义令所有存活角色各回复 1 点体力', async () => {
    const engine = engineWithHands('桃园结义');
    const players = engine.getState().players;
    players[0]!.hp = 3;
    players[1]!.hp = 2;
    players[2]!.hp = 4;
    players[3]!.hp = 1;

    expect(engine.initiatePlayCard('a', '桃园结义').ok).toBe(true);
    await confirmSourceCard(engine);
    await passWuxie(engine);

    expect(players.map((player) => player.hp)).toEqual([4, 3, 4, 2]);
    expect(engine.getState().prompt).toBeNull();
  });

  it.each(['乐不思蜀', '兵粮寸断'])('%s 无懈全员不出后置入判定区', async (cardName) => {
    const engine = engineWithHands(cardName);

    expect(engine.initiatePlayCard('a', cardName).ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().players[1]!.judgeCards).toContain(cardName);
    expect(engine.getState().log).toContain(`关羽 判定区置入【${cardName}】`);
  });

  it.each([
    ['过河拆桥', 'select_zone_card'],
    ['顺手牵羊', 'select_zone_card'],
  ])('%s 无懈全员不出后继续选目标区域牌', async (cardName, promptType) => {
    const engine = engineWithHands(cardName);
    engine.getState().players[1]!.handCards.push('闪');

    expect(engine.initiatePlayCard('a', cardName).ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    expect(engine.getState().prompt).toMatchObject({ type: promptType, playerId: 'a', cardName });
  });

  it('过河拆桥可选择目标手牌、装备区、判定区，手牌选项匿名', async () => {
    const engine = engineWithHands('过河拆桥');
    const target = engine.getState().players[1]!;
    target.handCards.push('闪');
    target.equipment = ['青龙偃月刀'];
    target.judgeCards = ['闪电'];

    expect(engine.initiatePlayCard('a', '过河拆桥').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a', cardName: '过河拆桥' });
    expect(prompt.zoneCardOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'equipment:0', label: '装备【青龙偃月刀】' }),
        expect.objectContaining({ id: 'judge:0', label: '判定【闪电】' }),
      ]),
    );
    expect(prompt.zoneCardOptions?.some((option) => /^手牌 \d+$/.test(option.label))).toBe(true);
    expect(prompt.zoneCardOptions?.some((option) => option.label.includes('【闪】'))).toBe(false);

    expect(engine.submitZoneCard('a', prompt.id, 'judge:0')).toMatchObject({ ok: true });
    expect(target.judgeCards).toEqual([]);
    expect(engine.getState().discardPile).toContain('闪电');
    expect(engine.getState().log).toContain('关羽 失去判定区【闪电】');
  });

  it('顺手牵羊可获得目标判定区牌并置入使用者手牌', async () => {
    const engine = engineWithHands('顺手牵羊');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.handCards.push('闪');
    target.equipment = ['青龙偃月刀'];
    target.judgeCards = ['乐不思蜀'];

    expect(engine.initiatePlayCard('a', '顺手牵羊').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a', cardName: '顺手牵羊' });
    expect(prompt.zoneCardOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'judge:0', label: '判定【乐不思蜀】' }),
      ]),
    );

    expect(engine.submitZoneCard('a', prompt.id, 'judge:0')).toMatchObject({ ok: true });
    expect(target.judgeCards).toEqual([]);
    expect(source.handCards).toContain('乐不思蜀');
    expect(engine.getState().log).toContain('刘备 获得 关羽 的判定区【乐不思蜀】');
  });

  it('界陆逊失去最后手牌后触发连营摸一张牌', async () => {
    const engine = engineWithHands('过河拆桥');
    const target = engine.getState().players[1]!;
    target.generalName = '界陆逊';
    target.handCards = ['闪'];
    engine.getDeck().stackTop(['杀']);

    expect(engine.initiatePlayCard('a', '过河拆桥').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a', cardName: '过河拆桥' });

    expect(engine.submitZoneCard('a', prompt.id, 'hand:0')).toMatchObject({ ok: true });
    expect(target.handCards).toHaveLength(1);
    expect(target.handCards[0]).toContain('【杀】');
    expect(target.skillUseCount.lianying).toBe(1);
    expect(engine.getState().log).toContain('界陆逊 发动【连营】，摸 1 张牌');
  });

  it('界孙尚香装备被过河拆桥弃置后触发枭姬摸两张牌', async () => {
    const engine = engineWithHands('过河拆桥');
    const target = engine.getState().players[1]!;
    target.generalName = '界孙尚香';
    target.equipment = ['青龙偃月刀'];
    const handCountBefore = target.handCards.length;
    engine.getDeck().stackTop(['杀', '闪']);

    expect(engine.initiatePlayCard('a', '过河拆桥').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a' });
    expect(engine.submitZoneCard('a', prompt.id, 'equipment:0')).toMatchObject({ ok: true });

    expect(target.equipment).toEqual([]);
    expect(target.handCards).toHaveLength(handCountBefore + 2);
    expect(target.handCards.slice(-2)[0]).toContain('【杀】');
    expect(target.handCards.slice(-2)[1]).toContain('【闪】');
    expect(target.skillUseCount.xiaoji).toBe(1);
    expect(engine.getState().log).toContain('界孙尚香 发动【枭姬】，因失去 1 张装备摸 2 张牌');
  });

  it('界孙尚香装备被顺手牵羊获得后触发枭姬摸两张牌', async () => {
    const engine = engineWithHands('顺手牵羊');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.generalName = '界孙尚香';
    target.equipment = ['青龙偃月刀'];
    const handCountBefore = target.handCards.length;
    engine.getDeck().stackTop(['杀', '闪']);

    expect(engine.initiatePlayCard('a', '顺手牵羊').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await passWuxie(engine);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a' });
    expect(engine.submitZoneCard('a', prompt.id, 'equipment:0')).toMatchObject({ ok: true });

    expect(target.equipment).toEqual([]);
    expect(source.handCards).toContain('青龙偃月刀');
    expect(target.handCards).toHaveLength(handCountBefore + 2);
    expect(target.handCards.slice(-2)[0]).toContain('【杀】');
    expect(target.handCards.slice(-2)[1]).toContain('【闪】');
    expect(target.skillUseCount.xiaoji).toBe(1);
  });

  it('界孙尚香替换装备失去旧装备后触发枭姬摸两张牌', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界孙尚香', ['青釭剑']),
        player('b', 2, '关羽', []),
      ],
    });
    const source = engine.getState().players[0]!;
    source.equipment = ['诸葛连弩'];
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';
    engine.getDeck().stackTop(['杀', '闪']);

    expect(engine.initiatePlayCard('a', '青釭剑', 0)).toMatchObject({ ok: true });
    await confirmSourceCard(engine);

    expect(source.equipment).toEqual(['青釭剑']);
    expect(source.handCards).toHaveLength(2);
    expect(source.handCards[0]).toContain('【杀】');
    expect(source.handCards[1]).toContain('【闪】');
    expect(source.skillUseCount.xiaoji).toBe(1);
    expect(engine.getState().discardPile).toContain('诸葛连弩');
  });

  it('界陆逊成为顺手牵羊目标时可发动谦逊取消影响', async () => {
    const engine = engineWithHands('顺手牵羊');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.generalName = '界陆逊';
    target.handCards = ['杀', '闪'];
    target.equipment = ['青龙偃月刀'];
    engine.getDeck().stackTop(['桃']);

    expect(engine.initiatePlayCard('a', '顺手牵羊').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'qianxun',
      cardName: '顺手牵羊',
    });

    expect(engine.submitQianxun('b', prompt.id, [0, 1])).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toBeNull();
    expect(target.handCards).toHaveLength(1);
    expect(target.handCards[0]).toContain('【桃】');
    expect(target.skillUseCount.lianying).toBe(1);
    expect(target.equipment).toEqual(['青龙偃月刀']);
    expect(source.handCards).not.toContain('青龙偃月刀');
    expect(engine.getState().log).toContain(
      '界陆逊 发动【谦逊】，弃置 闪、杀，取消【顺手牵羊】对自己的影响',
    );
  });

  it('界陆逊跳过谦逊后顺手牵羊继续正常结算', async () => {
    const engine = engineWithHands('顺手牵羊');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.generalName = '界陆逊';
    target.handCards = ['杀', '闪'];
    target.equipment = ['青龙偃月刀'];

    expect(engine.initiatePlayCard('a', '顺手牵羊').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'b', skillId: 'qianxun' });
    await engine.submitPromptChoice('b', prompt.id, 'skip');

    const zonePrompt = engine.getState().prompt!;
    expect(zonePrompt).toMatchObject({
      type: 'select_zone_card',
      playerId: 'a',
      cardName: '顺手牵羊',
    });
    expect(engine.submitZoneCard('a', zonePrompt.id, 'equipment:0')).toMatchObject({ ok: true });
    expect(target.equipment).toEqual([]);
    expect(source.handCards).toContain('青龙偃月刀');
  });

  it('无懈抵消后不进入主体结算', async () => {
    const engine = engineWithHands('南蛮入侵');

    expect(engine.initiatePlayCard('a', '南蛮入侵').ok).toBe(true);
    await confirmSourceCard(engine);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'wuxie:all');

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().resolution.targetQueue).toBeNull();
    expect(engine.getState().log).toContain('【南蛮入侵】被【无懈可击】抵消');
  });

  it('界黄月英使用普通锦囊时触发集智摸一张牌', async () => {
    const engine = engineWithSourceGeneral('无中生有', '界黄月英');
    engine.getDeck().stackTop(['杀']);

    expect(engine.initiatePlayCard('a', '无中生有').ok).toBe(true);
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'play_card_confirm', playerId: 'a' });

    await engine.submitPromptChoice('a', prompt.id, 'confirm');

    const huangYueying = engine.getState().players[0]!;
    expect(huangYueying.handCards.some((card) => card.includes('【杀】'))).toBe(true);
    expect(huangYueying.skillUseCount.jizhi).toBe(1);
    expect(engine.getState().log).toContain(
      '界黄月英 发动【集智】，因使用【无中生有】摸 1 张牌',
    );
  });

  it('界黄月英使用延时锦囊时不触发集智', async () => {
    const engine = engineWithSourceGeneral('乐不思蜀', '界黄月英');
    engine.getState().players[1]!.handCards = [];

    expect(engine.initiatePlayCard('a', '乐不思蜀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const huangYueying = engine.getState().players[0]!;
    expect(huangYueying.skillUseCount.jizhi).toBeUndefined();
    expect(engine.getState().log.some((line) => line.includes('发动【集智】'))).toBe(false);
  });

  it('界黄月英使用顺手牵羊时奇才令锦囊无距离限制', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界黄月英', ['顺手牵羊']),
        player('b', 2, '刘备', []),
        player('c', 3, '张飞', ['闪']),
        player('d', 4, '关羽', ['杀']),
      ],
    });
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '顺手牵羊', 0)).toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '顺手牵羊',
      validTargetIds: ['b', 'c', 'd'],
    });
  });

  it('界黄月英的奇才保护装备区防具和宝物不被其他角色弃置', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['过河拆桥']),
        player('b', 2, '界黄月英', []),
      ],
    });
    const target = engine.getState().players[1]!;
    target.equipment = ['仁王盾', '木牛流马', '赤兔'];
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '过河拆桥', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_zone_card', playerId: 'a' });
    expect(prompt.zoneCardOptions).toEqual([
      { id: 'equipment:2', label: '装备【赤兔】' },
    ]);

    expect(engine.submitZoneCard('a', prompt.id, 'equipment:0')).toMatchObject({
      ok: false,
      error: '所选牌无效',
    });
    expect(target.equipment).toEqual(['仁王盾', '木牛流马', '赤兔']);
  });

  it('界马超马术令距离 2 的角色可成为杀和顺手牵羊目标', () => {
    const shaEngine = new SangokushiEngine({
      players: [
        player('a', 1, '界马超', ['杀']),
        player('b', 2, '刘备', []),
        player('c', 3, '张飞', ['闪']),
      ],
    });
    shaEngine.getState().turn.index = 0;
    shaEngine.getState().turn.phase = 'play';

    expect(shaEngine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    expect(shaEngine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '杀',
      validTargetIds: ['b', 'c'],
    });

    const shunEngine = new SangokushiEngine({
      players: [
        player('a', 1, '界马超', ['顺手牵羊']),
        player('b', 2, '刘备', []),
        player('c', 3, '张飞', ['闪']),
      ],
    });
    shunEngine.getState().turn.index = 0;
    shunEngine.getState().turn.phase = 'play';

    expect(shunEngine.initiatePlayCard('a', '顺手牵羊', 0)).toMatchObject({ ok: true });
    expect(shunEngine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '顺手牵羊',
      validTargetIds: ['b', 'c'],
    });
  });

  it('界公孙瓒义从按体力阈值修正双向距离', () => {
    const highHpEngine = new SangokushiEngine({
      players: [
        player('a', 1, '界公孙瓒', ['杀']),
        player('b', 2, '刘备', []),
        player('c', 3, '张飞', ['闪']),
      ],
    });
    highHpEngine.getState().turn.index = 0;
    highHpEngine.getState().turn.phase = 'play';

    expect(highHpEngine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    expect(highHpEngine.getState().prompt).toMatchObject({
      type: 'select_targets',
      validTargetIds: ['b', 'c'],
    });

    const lowHpEngine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['杀']),
        player('b', 2, '张飞', []),
        player('c', 3, '界公孙瓒', ['闪']),
      ],
    });
    lowHpEngine.getState().players[2]!.hp = 2;
    lowHpEngine.getState().turn.index = 0;
    lowHpEngine.getState().turn.phase = 'play';

    expect(lowHpEngine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    expect(lowHpEngine.getState().prompt).toMatchObject({
      type: 'select_targets',
      validTargetIds: ['b'],
    });
  });

  it('袁术同疾触发时，攻击范围内含有袁术的杀只能指定袁术', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['杀']),
        player('b', 2, '袁术', ['闪', '桃', '酒']),
        player('c', 3, '张飞', ['闪']),
      ],
    });
    engine.getState().players[1]!.hp = 2;
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '杀',
      validTargetIds: ['b'],
    });
  });

  it('界公孙瓒使用黑色杀造成伤害后可发动趫猛获得坐骑', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界公孙瓒', ['♠7【杀】']),
        player('b', 2, '关羽', []),
      ],
    });
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.equipment = ['赤兔', '青釭剑'];
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'a',
      skillId: 'qiaomeng',
      targetPlayerIds: ['b'],
    });
    expect(prompt.zoneCardOptions).toEqual([
      { id: 'equipment:0', label: '装备【赤兔】' },
      { id: 'equipment:1', label: '装备【青釭剑】' },
    ]);

    expect(engine.submitQiaomengChoice('a', prompt.id, 0)).toMatchObject({ ok: true });

    expect(target.hp).toBe(3);
    expect(target.equipment).toEqual(['青釭剑']);
    expect(source.handCards).toContain('赤兔');
    expect(source.skillUseCount.qiaomeng).toBe(1);
    expect(engine.getState().discardPile).not.toContain('赤兔');
    expect(engine.getState().log).toContain('界公孙瓒 发动【趫猛】，获得 关羽 的坐骑【赤兔】');
  });

  it('界公孙瓒趫猛弃置非坐骑装备进入弃牌堆', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '界公孙瓒', ['♣9【杀】']),
        player('b', 2, '关羽', []),
      ],
    });
    const target = engine.getState().players[1]!;
    target.equipment = ['青釭剑'];
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'a', skillId: 'qiaomeng' });

    expect(engine.submitQiaomengChoice('a', prompt.id, 0)).toMatchObject({ ok: true });

    expect(target.equipment).toEqual([]);
    expect(engine.getState().discardPile).toContain('青釭剑');
    expect(engine.getState().players[0]!.handCards).not.toContain('青釭剑');
    expect(engine.getState().log).toContain('界公孙瓒 发动【趫猛】，弃置 关羽 的装备【青釭剑】');
  });

  it('界公孙瓒使用红色杀或目标无装备时不触发趫猛', async () => {
    const redShaEngine = new SangokushiEngine({
      players: [
        player('a', 1, '界公孙瓒', ['♥7【杀】']),
        player('b', 2, '关羽', []),
      ],
    });
    redShaEngine.getState().players[1]!.equipment = ['赤兔'];
    redShaEngine.getState().turn.index = 0;
    redShaEngine.getState().turn.phase = 'play';

    expect(redShaEngine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(redShaEngine, ['b']);
    await redShaEngine.submitPromptChoice('b', redShaEngine.getState().prompt!.id, 'pass');

    expect(redShaEngine.getState().prompt).toBeNull();
    expect(redShaEngine.getState().players[1]!.equipment).toEqual(['赤兔']);

    const noEquipmentEngine = new SangokushiEngine({
      players: [
        player('a', 1, '界公孙瓒', ['♠7【杀】']),
        player('b', 2, '关羽', []),
      ],
    });
    noEquipmentEngine.getState().turn.index = 0;
    noEquipmentEngine.getState().turn.phase = 'play';

    expect(noEquipmentEngine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(noEquipmentEngine, ['b']);
    await noEquipmentEngine.submitPromptChoice('b', noEquipmentEngine.getState().prompt!.id, 'pass');

    expect(noEquipmentEngine.getState().prompt).toBeNull();
  });

  it('界李典造成伤害后触发忘隙，双方各摸一张牌', async () => {
    const engine = engineWithSourceGeneral('杀', '界李典');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.handCards = [];
    engine.getDeck().stackTop(['桃', '闪']);

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(target.hp).toBe(3);
    expect(source.handCards).toHaveLength(1);
    expect(target.handCards).toHaveLength(1);
    expect(source.handCards[0]).toContain('【桃】');
    expect(target.handCards[0]).toContain('【闪】');
    expect(source.skillUseCount.wangxi).toBe(1);
    expect(engine.getState().log).toContain('界李典 发动【忘隙】，界李典 与 关羽 各摸 1 张牌');
  });

  it('界李典受到其他角色伤害后触发忘隙，双方各摸一张牌', async () => {
    const engine = engineWithSourceGeneral('杀', '刘备');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    target.generalName = '界李典';
    target.handCards = [];
    engine.getDeck().stackTop(['桃', '闪']);

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(target.hp).toBe(3);
    expect(target.handCards).toHaveLength(1);
    expect(source.handCards).toHaveLength(1);
    expect(target.handCards[0]).toContain('【桃】');
    expect(source.handCards[0]).toContain('【闪】');
    expect(target.skillUseCount.wangxi).toBe(1);
    expect(engine.getState().log).toContain('界李典 发动【忘隙】，界李典 与 刘备 各摸 1 张牌');
  });

  it('界徐庶造成伤害后若已受伤则觉醒潜心并获得荐言', async () => {
    const engine = engineWithSourceGeneral('杀', '界徐庶');
    const source = engine.getState().players[0]!;
    source.hp = 3;
    source.maxHp = 4;

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(source.maxHp).toBe(3);
    expect(source.hp).toBe(3);
    expect(source.usedLimitedSkills?.qianxin).toBe(true);
    expect(source.skillUseCount.qianxin).toBe(1);
    expect(engine.getState().log).toContain(
      '界徐庶 触发觉醒技【潜心】，减 1 点体力上限并获得【荐言】（3/3）',
    );

    expect(engine.initiateSkill('a', 'jianyan')).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'use_skill',
      skillId: 'jianyan',
      validTargetIds: ['b'],
    });
  });

  it('界徐庶潜心一局只觉醒一次', async () => {
    const engine = engineWithSourceGeneral('杀', '界徐庶');
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    source.hp = 3;
    source.maxHp = 4;
    target.handCards = [];

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    source.handCards = ['杀'];
    source.shaUsedCount = 0;
    target.handCards = [];
    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'pass');

    expect(source.maxHp).toBe(3);
    expect(source.skillUseCount.qianxin).toBe(1);
  });

  it('界大乔成为杀目标时可发动流离转移给攻击范围内其他角色', async () => {
    const engine = engineForLiuli();
    const daqiao = engine.getState().players[1]!;
    const redirected = engine.getState().players[2]!;

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'liuli',
      cardName: '杀',
      validTargetIds: ['c'],
    });
    expect(prompt.skillCardOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'hand:0' })]),
    );

    expect(engine.submitLiuli('b', prompt.id, 'c', 'hand:0')).toMatchObject({ ok: true });

    expect(daqiao.handCards).toEqual([]);
    expect(daqiao.hp).toBe(4);
    expect(daqiao.skillUseCount.liuli).toBe(1);
    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'c',
      cardName: '杀',
      targetPlayerIds: ['c'],
    });

    await engine.submitPromptChoice('c', engine.getState().prompt!.id, 'pass');

    expect(redirected.hp).toBe(3);
    expect(daqiao.hp).toBe(4);
    expect(engine.getState().log).toContain('界大乔 发动【流离】，将【杀】转移给 张飞');
  });

  it('界大乔跳过流离后继续由自己响应杀', async () => {
    const engine = engineForLiuli();

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'use_skill', playerId: 'b', skillId: 'liuli' });
    await engine.submitPromptChoice('b', prompt.id, 'skip');

    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '杀',
      targetPlayerIds: ['b'],
    });
  });

  it('界马超铁骑判定后目标不弃同花色手牌则不能使用闪响应', async () => {
    const engine = engineForTieqi(['♣7【闪】']);
    const target = engine.getState().players[1]!;
    engine.getDeck().stackTop(['♠2【杀】']);

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const offerPrompt = engine.getState().prompt!;
    expect(offerPrompt).toMatchObject({
      type: 'use_skill',
      playerId: 'a',
      skillId: 'tieqi',
      targetPlayerIds: ['b'],
    });
    await expect(
      engine.submitPromptChoice('a', offerPrompt.id, 'skill:tieqi'),
    ).resolves.toMatchObject({ ok: true });

    expect(target.skillUseCount._yijue_non_locked_disabled).toBe(1);
    expect(engine.getState().prompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '杀',
      validResponseCards: [],
    });

    const prompt = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('b', prompt.id, 'card:♣7【闪】'),
    ).resolves.toMatchObject({ ok: false, error: '受到【铁骑】影响，不能使用【闪】响应此【杀】' });

    await engine.submitPromptChoice('b', prompt.id, 'pass');
    expect(target.hp).toBe(3);
    expect(engine.getState().log).toContain('界华佗 没有♠花色手牌，不能使用【闪】响应此【杀】');
  });

  it('界马超可选择不发动铁骑并允许目标正常出闪', async () => {
    const engine = engineForTieqi(['闪']);
    const target = engine.getState().players[1]!;

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const offerPrompt = engine.getState().prompt!;
    expect(offerPrompt).toMatchObject({ type: 'use_skill', playerId: 'a', skillId: 'tieqi' });
    await expect(
      engine.submitPromptChoice('a', offerPrompt.id, 'skip'),
    ).resolves.toMatchObject({ ok: true });

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'b',
    });
    expect(responsePrompt.validResponseCards).toHaveLength(1);
    const shanEntry = responsePrompt.validResponseCards![0]!;
    await engine.submitPromptChoice('b', responsePrompt.id, `card:${shanEntry}`);

    expect(target.hp).toBe(4);
    expect(target.skillUseCount._yijue_non_locked_disabled).toBeUndefined();
  });

  it('界马超铁骑目标弃置同花色手牌后可以使用闪抵消杀', async () => {
    const engine = engineForTieqi(['♠7【闪】', '闪']);
    const target = engine.getState().players[1]!;
    engine.getDeck().stackTop(['♠2【杀】']);

    expect(engine.initiatePlayCard('a', '杀').ok).toBe(true);
    await chooseTargets(engine, ['b']);

    const offerPrompt = engine.getState().prompt!;
    expect(offerPrompt).toMatchObject({ type: 'use_skill', playerId: 'a', skillId: 'tieqi' });
    await expect(
      engine.submitPromptChoice('a', offerPrompt.id, 'skill:tieqi'),
    ).resolves.toMatchObject({ ok: true });

    const tieqiPrompt = engine.getState().prompt!;
    expect(tieqiPrompt).toMatchObject({
      type: 'use_skill',
      playerId: 'b',
      skillId: 'tieqi',
    });
    expect(tieqiPrompt.discardHandIndices).toContain(0);
    await expect(
      engine.submitPromptChoice('b', tieqiPrompt.id, 'tieqi:discard:0'),
    ).resolves.toMatchObject({ ok: true });

    expect(target.handCards).toHaveLength(1);
    expect(target.handCards[0]).toContain('【闪】');
    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '杀',
    });
    expect(responsePrompt.validResponseCards).toHaveLength(1);
    const shanEntry = responsePrompt.validResponseCards![0]!;
    await expect(
      engine.submitPromptChoice('b', responsePrompt.id, `card:${shanEntry}`),
    ).resolves.toMatchObject({ ok: true });

    expect(target.hp).toBe(4);
    expect(target.handCards).toEqual([]);
    expect(engine.getState().log).toContain('界华佗 弃置 ♠7【闪】，可以使用【闪】响应此【杀】');
  });

  it('界曹操可发动护驾令魏势力角色代出闪响应杀', async () => {
    const engine = engineForLordAssist('界曹操', 'wei', '界司马懿', 'wei');
    const lord = engine.getState().players[0]!;
    const assistant = engine.getState().players[2]!;

    expect(engine.initiatePlayCard('b', '杀').ok).toBe(true);
    await chooseTargetsFor(engine, 'b', ['a']);

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'a',
      cardName: '杀',
      validResponseCards: [],
    });
    expect(responsePrompt.options?.map((option) => option.id)).toContain('lord_assist:shan');

    await expect(
      engine.submitPromptChoice('a', responsePrompt.id, 'lord_assist:shan'),
    ).resolves.toMatchObject({ ok: true });

    const assistPrompt = engine.getState().prompt!;
    expect(assistPrompt).toMatchObject({
      type: 'response',
      playerId: 'c',
    });
    expect(assistPrompt.validResponseCards).toHaveLength(1);
    const shanEntry = assistPrompt.validResponseCards![0]!;
    expect(shanEntry).toContain('【闪】');
    await expect(
      engine.submitPromptChoice('c', assistPrompt.id, `lord:card:${shanEntry}`),
    ).resolves.toMatchObject({ ok: true });

    expect(lord.hp).toBe(4);
    expect(lord.skillUseCount.hujia).toBe(1);
    expect(assistant.handCards).toEqual([]);
    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().log).toContain('界司马懿 响应【护驾】，替 界曹操 打出【闪】');
  });

  it('界刘备可发动激将令蜀势力角色代出杀响应决斗', async () => {
    const engine = new SangokushiEngine({
      players: [
        { ...player('a', 1, '界刘备', []), role: '主公', roleRevealed: true, kingdom: 'shu' },
        { ...player('b', 2, '张飞', ['决斗']), kingdom: 'qun' },
        { ...player('c', 3, '界关羽', ['杀']), kingdom: 'shu' },
      ],
    });
    engine.getState().turn.index = 1;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('b', '决斗').ok).toBe(true);
    await chooseTargetsFor(engine, 'b', ['a']);

    const responsePrompt = engine.getState().prompt!;
    expect(responsePrompt).toMatchObject({
      type: 'response',
      playerId: 'a',
      cardName: '决斗',
      validResponseCards: [],
    });
    expect(responsePrompt.options?.map((option) => option.id)).toContain('lord_assist:sha');

    await expect(
      engine.submitPromptChoice('a', responsePrompt.id, 'lord_assist:sha'),
    ).resolves.toMatchObject({ ok: true });

    const assistPrompt = engine.getState().prompt!;
    expect(assistPrompt).toMatchObject({
      type: 'response',
      playerId: 'c',
    });
    expect(assistPrompt.validResponseCards).toHaveLength(1);
    const shaEntry = assistPrompt.validResponseCards![0]!;
    expect(shaEntry).toContain('【杀】');
    await expect(
      engine.submitPromptChoice('c', assistPrompt.id, `lord:card:${shaEntry}`),
    ).resolves.toMatchObject({ ok: true });

    const nextDuelPrompt = engine.getState().prompt!;
    expect(nextDuelPrompt).toMatchObject({
      type: 'response',
      playerId: 'b',
      cardName: '决斗',
    });
    expect(engine.getState().players[0]!.skillUseCount.jijiang).toBe(1);
    expect(engine.getState().players[2]!.handCards).toEqual([]);
  });

  it('丈八蛇矛可将两张手牌当杀使用并弃入弃牌堆', async () => {
    const engine = engineForVirtualCard('刘备', ['桃', '闪']);
    const source = engine.getState().players[0]!;
    source.equipment = ['丈八蛇矛'];

    expect(engine.initiatePlayCard('a', '杀', 0)).toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({
      type: 'select_targets',
      playerId: 'a',
      cardName: '杀',
    });
    await chooseTargets(engine, ['b']);

    const response = engine.getState().prompt!;
    expect(response).toMatchObject({ type: 'response', playerId: 'b' });
    await expect(engine.submitPromptChoice('b', response.id, 'pass')).resolves.toMatchObject({ ok: true });

    expect(source.handCards).toEqual([]);
    expect(source.shaUsedCount).toBe(1);
    expect(engine.getState().log).toContain('刘备 发动【丈八蛇矛】，将 桃、闪 当【杀】使用');
    expect(engine.getDeck().discardPile()).toEqual(expect.arrayContaining(['桃', '闪']));
  });

  it('方天画戟在最后一张手牌为杀时可选择至多三名目标', async () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', ['杀']),
        player('b', 2, '关羽', ['闪']),
        player('c', 3, '张飞', ['闪']),
        player('d', 4, '赵云', ['闪']),
      ],
    });
    const source = engine.getState().players[0]!;
    source.equipment = ['方天画戟'];
    engine.getState().turn.index = 0;
    engine.getState().turn.phase = 'play';

    expect(engine.initiatePlayCard('a', '杀')).toMatchObject({ ok: true });
    const prompt = engine.getState().prompt!;
    expect(prompt).toMatchObject({ type: 'select_targets', playerId: 'a' });
    await expect(engine.selectTargets('a', prompt.id, ['b', 'c', 'd'])).resolves.toMatchObject({ ok: true });

    expect(engine.getState().prompt).toMatchObject({ type: 'response', playerId: 'b' });
    expect(source.handCards).toEqual([]);
    expect(source.shaUsedCount).toBe(1);
  });

  it('青龙偃月刀在杀被闪抵消后可再使用一张杀', async () => {
    const engine = engineForVirtualCard('刘备', ['杀', '杀']);
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    source.equipment = ['青龙偃月刀'];
    target.handCards = ['闪'];

    expect(engine.initiatePlayCard('a', '杀')).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    const firstResponse = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('b', firstResponse.id, 'card:闪'),
    ).resolves.toMatchObject({ ok: true });

    const weaponPrompt = engine.getState().prompt!;
    expect(weaponPrompt).toMatchObject({
      type: 'use_skill',
      playerId: 'a',
      skillId: 'sha_dodged_equipment',
    });
    await expect(
      engine.submitPromptChoice('a', weaponPrompt.id, 'qinglong:sha'),
    ).resolves.toMatchObject({ ok: true });
    expect(engine.getState().prompt).toMatchObject({ type: 'response', playerId: 'b' });

    const secondResponse = engine.getState().prompt!;
    await expect(engine.submitPromptChoice('b', secondResponse.id, 'pass')).resolves.toMatchObject({ ok: true });
    expect(target.hp).toBe(3);
    expect(source.handCards).toEqual([]);
    expect(source.shaUsedCount).toBe(2);
    expect(engine.getState().log).toContain('刘备 发动【青龙偃月刀】，对 张飞 再使用一张【杀】');
  });

  it('贯石斧在杀被闪抵消后弃两张牌令杀强制命中', async () => {
    const engine = engineForVirtualCard('刘备', ['杀', '桃']);
    const source = engine.getState().players[0]!;
    const target = engine.getState().players[1]!;
    source.equipment = ['贯石斧'];
    target.handCards = ['闪'];

    expect(engine.initiatePlayCard('a', '杀')).toMatchObject({ ok: true });
    await chooseTargets(engine, ['b']);
    const response = engine.getState().prompt!;
    await expect(
      engine.submitPromptChoice('b', response.id, 'card:闪'),
    ).resolves.toMatchObject({ ok: true });

    const weaponPrompt = engine.getState().prompt!;
    expect(weaponPrompt.skillCardOptions?.map((option) => option.id)).toEqual(['hand:0', 'equipment:0']);
    await expect(
      engine.submitPromptChoice('a', weaponPrompt.id, 'guanshi:force:cards:hand:0,equipment:0'),
    ).resolves.toMatchObject({ ok: true });

    expect(target.hp).toBe(3);
    expect(source.handCards).toEqual([]);
    expect(source.equipment).toEqual([]);
    expect(engine.getState().log).toContain('刘备 发动【贯石斧】，弃置两张牌令【杀】强制命中 张飞');
  });
});
