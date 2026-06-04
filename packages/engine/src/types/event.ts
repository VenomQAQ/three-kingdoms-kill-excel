/** 结算阶段：对应 Pre / On / Post（execute 为事件本体，不触发规则监听） */
export type EventPhase = 'pre' | 'on' | 'post';

/** 可入栈结算的游戏事件类型 */
export enum GameEventType {
  USE_CARD = 'useCard',
  TARGET_RESOLVE = 'targetResolve',
  TAKE_DAMAGE = 'takeDamage',
  RECOVER = 'recover',
  JUDGE = 'judge',
  DYING = 'dying',
  DEATH = 'death',
  DRAW = 'draw',
  DISCARD = 'discard',
  MOVE_CARD = 'moveCard',
  USE_SKILL = 'useSkill',
}

export interface GameEventPayload {
  sourcePlayerId?: string;
  targetPlayerIds?: string[];
  cardId?: string;
  cardName?: string;
  amount?: number;
  skillId?: string;
  judgeCardName?: string;
  /** 任意扩展字段，由 executeCore / Handler 约定 */
  [key: string]: unknown;
}

/** 结算栈上的事件单元 */
export interface GameEvent {
  id: string;
  type: GameEventType;
  payload: GameEventPayload;
  cancelled?: boolean;
  /** 入栈优先级：濒死等插入事件使用更高值 */
  insertPriority?: number;
}

export const MAX_RESOLUTION_STACK_DEPTH = 255;
