import { CharacterRegistry } from '../registry/character-registry';
import type { CardInstance } from './card-instance';
import { formatCardInstance, judgeDelayEffect } from './card-instance';
import type { EnginePlayerState } from '../types/game';
import { GameTiming } from '../types/timing';

export interface PendingJudge {
  targetPlayerId: string;
  judgeCardName: string;
  result: CardInstance;
  /** 原始判定牌展示串，用于判定后获得或弃置 */
  resultCardEntry: string;
  /** 被判定角色若拥有判定后技能，可在判定生效后获得最终判定牌 */
  judgedSkillOwnerId?: string;
  /** 按座位顺序待询问改判的角色 id（从被判定角色起） */
  modifyQueue: string[];
  modifyIndex: number;
  modified: boolean;
}

/** 判定牌生效前可改判的角色（如鬼才） */
export function collectModifyJudgePlayers(
  judgedPlayer: EnginePlayerState,
  allPlayers: EnginePlayerState[],
): string[] {
  const ordered = [...allPlayers].sort((a, b) => a.seat - b.seat);
  const startIdx = ordered.findIndex((p) => p.id === judgedPlayer.id);
  const ids: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[(startIdx + i) % ordered.length]!;
    if (p.hp <= 0) continue;
    const ch = CharacterRegistry.resolve(p.generalName);
    const canModify = ch?.skills.some(
      (s) =>
        s.timings.includes(GameTiming.JUDGE) &&
        s.effects?.some((e) => e.action === 'modifyJudge'),
    );
    if (canModify && p.handCards.length > 0) ids.push(p.id);
  }
  return ids;
}

export function describeJudgeResult(
  player: EnginePlayerState,
  judgeCardName: string,
  result: CardInstance,
): string {
  const effect = judgeDelayEffect(judgeCardName, result);
  const effectText =
    judgeCardName === '乐不思蜀'
      ? effect
        ? '生效（跳过出牌阶段）'
        : '无效'
      : judgeCardName === '兵粮寸断'
        ? effect
          ? '生效（跳过摸牌阶段）'
          : '无效'
        : judgeCardName === '闪电'
          ? effect
            ? '生效（受到3点雷电伤害）'
            : '无效'
          : effect
            ? '生效'
            : '无效';
  return `${player.generalName} 判定【${judgeCardName}】：${formatCardInstance(result)} → ${effectText}`;
}

export function applyJudgeEffect(
  player: EnginePlayerState,
  judgeCardName: string,
  result: CardInstance,
): { skipPlay?: boolean; skipDraw?: boolean; lightningDamage?: number } {
  if (!judgeDelayEffect(judgeCardName, result)) return {};
  if (judgeCardName === '乐不思蜀') return { skipPlay: true };
  if (judgeCardName === '兵粮寸断') return { skipDraw: true };
  if (judgeCardName === '闪电') return { lightningDamage: 3 };
  return {};
}
