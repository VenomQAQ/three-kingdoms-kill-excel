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

describe('CardPlayService trick resolution', () => {
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

  it.each([
    ['决斗', { type: 'response', playerId: 'b', cardName: '决斗' }],
    ['借刀杀人', { type: 'response', playerId: 'b', cardName: '借刀杀人' }],
    ['五谷丰登', { type: 'pick_revealed', playerId: 'b', cardName: '五谷丰登' }],
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

  it('无懈抵消后不进入主体结算', async () => {
    const engine = engineWithHands('南蛮入侵');

    expect(engine.initiatePlayCard('a', '南蛮入侵').ok).toBe(true);
    await confirmSourceCard(engine);
    await engine.submitPromptChoice('b', engine.getState().prompt!.id, 'wuxie:all');

    expect(engine.getState().prompt).toBeNull();
    expect(engine.getState().resolution.targetQueue).toBeNull();
    expect(engine.getState().log).toContain('【南蛮入侵】被【无懈可击】抵消');
  });
});
