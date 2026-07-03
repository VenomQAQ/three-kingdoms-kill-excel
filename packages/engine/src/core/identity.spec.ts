import { describe, expect, it } from 'vitest';
import {
  assignIdentities,
  checkVictory,
  getIdentityPack,
} from './identity';
import type { EnginePlayerState } from '../types/game';

function player(
  id: string,
  role: string,
  hp = 4,
  overrides: Partial<EnginePlayerState> = {},
): EnginePlayerState {
  return {
    id,
    seat: 1,
    nickname: id,
    generalId: 'test',
    generalName: id,
    role,
    kingdom: 'wei',
    hp,
    maxHp: 4,
    handCards: [],
    equipment: [],
    judgeCards: [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
    ...overrides,
  };
}

describe('identity', () => {
  it('getIdentityPack 8人局身份构成正确', () => {
    const pack = getIdentityPack(8);
    expect(pack.filter((r) => r === '主公')).toHaveLength(1);
    expect(pack.filter((r) => r === '忠臣')).toHaveLength(2);
    expect(pack.filter((r) => r === '反贼')).toHaveLength(4);
    expect(pack.filter((r) => r === '内奸')).toHaveLength(1);
  });

  it('assignIdentities 主公分配给房主座位', () => {
    const seats = [{ role: '' }, { role: '' }, { role: '' }];
    assignIdentities(seats, 1);
    expect(seats[1]?.role).toBe('主公');
    expect(seats.map((s) => s.role)).toContain('反贼');
  });

  it('checkVictory 主公方消灭反贼内奸获胜', () => {
    const result = checkVictory([
      player('lord', '主公', 4),
      player('loyal', '忠臣', 3),
    ]);
    expect(result?.winners).toEqual(['主公', '忠臣']);
  });

  it('checkVictory 主公死亡且反贼存活则反贼胜', () => {
    const result = checkVictory([
      player('lord', '主公', 0),
      player('rebel', '反贼', 3),
    ]);
    expect(result?.winners).toEqual(['反贼']);
  });

  it('checkVictory 内奸独存获胜', () => {
    const result = checkVictory([player('traitor', '内奸', 2)]);
    expect(result?.winners).toEqual(['内奸']);
  });
});
