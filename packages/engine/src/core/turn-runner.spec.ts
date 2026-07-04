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

describe('TurnRunner phase rules', () => {
  it('闪电判定未生效后移入下一名存活角色判定区', () => {
    const engine = new SangokushiEngine({
      players: [
        player('a', 1, '刘备', { judgeCards: ['闪电'] }),
        player('b', 2, '关羽'),
        player('c', 3, '张飞'),
      ],
    });

    engine.getDeck().stackTop(['♥5【杀】']);
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
});
