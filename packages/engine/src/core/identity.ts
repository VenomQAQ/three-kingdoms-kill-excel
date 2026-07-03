import { CHARACTERS } from '../config/characters';
import { CharacterRegistry } from '../registry/character-registry';
import type { EnginePlayerState } from '../types/game';

export type IdentityRole = '主公' | '忠臣' | '反贼' | '内奸';

/** 身份局人数 → 身份牌构成（与 docs/gameplay.md §2 一致） */
const IDENTITY_PACKS: Record<number, IdentityRole[]> = {
  2: ['主公', '反贼'],
  3: ['主公', '反贼', '内奸'],
  4: ['主公', '忠臣', '反贼', '内奸'],
  5: ['主公', '忠臣', '反贼', '反贼', '内奸'],
  6: ['主公', '忠臣', '反贼', '反贼', '反贼', '内奸'],
  7: ['主公', '忠臣', '忠臣', '反贼', '反贼', '反贼', '内奸'],
  8: ['主公', '忠臣', '忠臣', '反贼', '反贼', '反贼', '反贼', '内奸'],
  9: ['主公', '忠臣', '忠臣', '忠臣', '反贼', '反贼', '反贼', '反贼', '内奸'],
  10: ['主公', '忠臣', '忠臣', '忠臣', '反贼', '反贼', '反贼', '反贼', '内奸', '内奸'],
};

function shuffle<T>(arr: T[]): T[] {
  const pile = [...arr];
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pile[i], pile[j]] = [pile[j]!, pile[i]!];
  }
  return pile;
}

export function getIdentityPack(playerCount: number): IdentityRole[] {
  const pack = IDENTITY_PACKS[playerCount];
  if (!pack) {
    throw new Error(`不支持 ${playerCount} 人身份局`);
  }
  return shuffle(pack);
}

/** 为座位上的玩家分配身份（主公固定给 lordIndex 座位） */
export function assignIdentities<T extends { role?: string; seat?: number }>(
  players: T[],
  lordIndex = 0,
): void {
  const pack = getIdentityPack(players.length);
  const otherRoles = shuffle(pack.filter((r) => r !== '主公'));
  let otherIdx = 0;
  players.forEach((p, i) => {
    p.seat = i + 1;
    if (i === lordIndex) {
      p.role = '主公';
    } else {
      p.role = otherRoles[otherIdx++] ?? '反贼';
    }
  });
}

/** 随机 3 将选 1：为每名玩家分配武将 */
export function assignRandomGenerals(
  players: { general?: string; nickname: string }[],
): void {
  const pool = CHARACTERS.map((c) => c.name);
  for (const p of players) {
    if (p.general) continue;
    const picks = shuffle(pool).slice(0, 3);
    p.general = picks[0] ?? p.nickname;
  }
}

export interface VictoryResult {
  winners: IdentityRole[];
  message: string;
}

/** 官方胜负：主公胜=灭反贼+内奸；反贼胜=主公死亡且仍有反贼存活；内奸胜=唯一存活 */
export function checkVictory(players: EnginePlayerState[]): VictoryResult | null {
  const alive = players.filter((p) => p.hp > 0);
  if (alive.length === 0) {
    return { winners: [], message: '全员阵亡，平局' };
  }
  if (alive.length === 1) {
    const sole = alive[0]!;
    if (sole.role === '内奸') {
      return { winners: ['内奸'], message: `内奸 ${sole.generalName} 独存，内奸胜利` };
    }
    if (sole.role === '主公') {
      return { winners: ['主公', '忠臣'], message: `主公 ${sole.generalName} 独存，主公方胜利` };
    }
    return { winners: [sole.role as IdentityRole], message: `${sole.role} ${sole.generalName} 独存` };
  }

  const rebels = alive.filter((p) => p.role === '反贼');
  const traitors = alive.filter((p) => p.role === '内奸');
  const lord = alive.find((p) => p.role === '主公');

  if (!lord) {
    if (rebels.length > 0) {
      return { winners: ['反贼'], message: '主公阵亡且反贼仍在场，反贼胜利' };
    }
    if (traitors.length === alive.length) {
      return { winners: ['内奸'], message: '主公阵亡，仅剩内奸，内奸胜利' };
    }
    return null;
  }

  if (rebels.length === 0 && traitors.length === 0) {
    return { winners: ['主公', '忠臣'], message: '反贼与内奸全灭，主公方胜利' };
  }

  return null;
}

export function ensureCharacterResolved(name: string): void {
  CharacterRegistry.resolve(name);
}
