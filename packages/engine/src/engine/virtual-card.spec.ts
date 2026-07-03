import { describe, expect, it } from 'vitest';
import { validResponseCardsForPlayer } from '../engine/virtual-card';
import type { EnginePlayerState } from '../types/game';

function mkPlayer(skills: string[], hand: string[]): EnginePlayerState {
  return {
    id: 'p1',
    seat: 1,
    nickname: '测试',
    generalId: 'guan_yu',
    generalName: '界关羽',
    role: '反贼',
    kingdom: 'shu',
    hp: 4,
    maxHp: 4,
    handCards: hand,
    equipment: [],
    judgeCards: [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
  };
}

// 模拟 playerHasSkill：virtual-card 依赖 CharacterRegistry，此处用手牌+技能名测试龙胆/武圣路径
describe('virtual-card', () => {
  it('武圣可将红色牌当杀打出', () => {
    const p = mkPlayer(['wusheng'], ['♥3【桃】', '♣5【杀】']);
    p.generalName = '界关羽';
    const cards = validResponseCardsForPlayer(p, 'sha', p.handCards);
    expect(cards.some((c) => c.includes('桃'))).toBe(true);
    expect(cards.some((c) => c.includes('杀'))).toBe(true);
  });

  it('龙胆可将闪当杀打出', () => {
    const p = mkPlayer(['longdan'], ['闪', '杀']);
    // longdan 需要 CharacterRegistry 中有技能定义；界赵云有 longdan
    p.generalName = '界赵云';
    const cards = validResponseCardsForPlayer(p, 'sha', p.handCards);
    expect(cards).toContain('闪');
  });
});
