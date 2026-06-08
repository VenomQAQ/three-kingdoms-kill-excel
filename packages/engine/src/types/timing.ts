/** 游戏时机 — 技能与效果挂载点 */
export enum GameTiming {
  ROUND_START = 'ROUND_START',
  TURN_START = 'TURN_START',
  PHASE_JUDGE = 'PHASE_JUDGE',
  BEFORE_DRAW = 'BEFORE_DRAW',
  PHASE_DRAW = 'PHASE_DRAW',
  PHASE_PLAY = 'PHASE_PLAY',
  PHASE_DISCARD = 'PHASE_DISCARD',
  PHASE_END = 'PHASE_END',
  TURN_END = 'TURN_END',

  BEFORE_CARD_USED = 'BEFORE_CARD_USED',
  CARD_USED = 'CARD_USED',
  BEFORE_DAMAGE = 'BEFORE_DAMAGE',
  DAMAGE = 'DAMAGE',
  AFTER_DAMAGE = 'AFTER_DAMAGE',
  DYING = 'DYING',
  DEATH = 'DEATH',
  BEFORE_JUDGE = 'BEFORE_JUDGE',
  JUDGE = 'JUDGE',
  AFTER_JUDGE = 'AFTER_JUDGE',
  CARD_DRAWN = 'CARD_DRAWN',
  EQUIP = 'EQUIP',

  /** 摸牌阶段开始（突袭、裸衣等） */
  PHASE_DRAW_START = 'PHASE_DRAW_START',
  /** 出牌阶段开始（连弩等） */
  PHASE_PLAY_START = 'PHASE_PLAY_START',
  /** 计算距离时（+1/-1 马、马术、义从） */
  CALC_DISTANCE = 'CALC_DISTANCE',
  /** 伤害数值确定前（裸衣 +1 等） */
  ON_DAMAGE_CALC = 'ON_DAMAGE_CALC',
}

export type TurnPhase =
  | 'judge'
  | 'before_draw'
  | 'draw'
  | 'play'
  | 'discard'
  | 'end';
