import type { TurnPhase } from './timing';

export type PromptType =
  | 'use_skill'
  | 'play_card_confirm'
  | 'select_targets'
  | 'response'
  | 'dying_rescue'
  | 'discard_cards'
  | 'modify_judge'
  | 'select_zone_card'
  | 'pick_revealed';

export interface PromptSkillInfo {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface PromptOption {
  id: string;
  label: string;
}

export interface GamePrompt {
  id: string;
  type: PromptType;
  playerId: string;
  cardId?: string;
  cardName?: string;
  skillId?: string;
  skillName?: string;
  sourcePlayerId?: string;
  targetPlayerIds?: string[];
  validTargetIds?: string[];
  validResponseCards?: string[];
  dyingPlayerId?: string;
  /** 弃牌阶段须弃置的张数 */
  discardCount?: number;
  /** 可选手牌下标 */
  discardHandIndices?: number[];
  /** 选区域牌：手牌/装备选项 */
  zoneCardOptions?: { id: string; label: string }[];
  /** 观星：可调整的牌堆顶牌 */
  guanxingCards?: string[];
  /** 当前操控角色技能（出牌确认 / 发动技能弹窗展示） */
  characterSkills?: PromptSkillInfo[];
  /** 提交一次后即关闭弹窗 */
  autoCloseAfterSubmit?: boolean;
  /** 判定结果展示 */
  judgeCardName?: string;
  judgeResult?: string;
  judgeTargetId?: string;
  message: string;
  options?: PromptOption[];
}

export interface EnginePlayerState {
  id: string;
  seat: number;
  nickname: string;
  generalId: string;
  generalName: string;
  role: string;
  /** 身份是否已公开（主公开局公开，其余死亡时公开） */
  roleRevealed?: boolean;
  kingdom: string;
  /** 是否已阵亡 */
  dead?: boolean;
  hp: number;
  maxHp: number;
  handCards: string[];
  equipment: string[];
  judgeCards: string[];
  /** 本回合已使用【杀】次数 */
  shaUsedCount: number;
  /** 本回合各技能已用次数 skillId -> count */
  skillUseCount: Record<string, number>;
  /** 本回合各技能已指定过的目标 skillId -> playerIds */
  skillTargetUseCount: Record<string, string[]>;
  /** 已发动过的限定技 skillId -> true */
  usedLimitedSkills?: Record<string, boolean>;
  /** 上个回合结束时的体力，用于【替身】等准备阶段技能 */
  lastTurnEndHp?: number;
}

export interface EngineSnapshot {
  turnIndex: number;
  round: number;
  turnPhase: TurnPhase;
  log: string[];
  prompt: GamePrompt | null;
  players: EnginePlayerState[];
  /** 对局结束时的胜负信息 */
  victory?: { winners: string[]; message: string } | null;
  /** 判定阶段：翻出判定牌后、生效前的上下文 */
  pendingJudge?: {
    targetPlayerId: string;
    judgeCardName: string;
    result: { name: string; suit: string; point: number };
    modifyQueue: string[];
    modifyIndex: number;
    modified: boolean;
  };
  /** 当前结算栈：等待响应的上下文 */
  pendingCard?: {
    cardId: string;
    sourceId: string;
    targetIds: string[];
    /** 手牌区下标，用于区分多张同名牌 */
    handIndex?: number;
    awaitingResponseFrom?: string;
    responseType?: string;
    /** AOE：按顺序待响应的角色 id */
    aoeQueue?: string[];
    /** 当前目标本回合已打出的有效响应次数 */
    responseCount?: number;
    /** 锁定技等要求的最少有效响应次数 */
    responsesRequired?: number;
  };
}
