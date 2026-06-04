export type CardType = 'basic' | 'trick' | 'equipment';
export type EquipmentSlot = 'weapon' | 'armor' | 'horse_plus' | 'horse_minus';
export type TrickSubType = 'instant' | 'delay' | 'aoe' | 'damage';

export type EffectAction =
  | 'draw'
  | 'discard'
  | 'moveCard'
  | 'damage'
  | 'recover'
  | 'judge'
  | 'modifyJudge'
  | 'useVirtualCard'
  | 'showCard'
  | 'chooseOption'
  | 'skipPhase'
  | 'promptResponse'
  | 'giveCards'
  | 'equip'
  | 'modifyRule';

export interface TargetCount {
  min: number;
  max: number;
}

export interface TargetFilter {
  relation?: ('self' | 'other' | 'enemy' | 'ally')[];
  alive?: boolean;
  kingdom?: string[];
}

export interface RangeRule {
  type: 'attack' | 'unlimited' | 'adjacent' | 'fixed' | 'none';
  value?: number;
}

export interface TargetRule {
  selector: 'self' | 'one' | 'all' | 'allOthers' | 'choose' | 'none';
  count?: TargetCount;
  filter?: TargetFilter;
  range?: RangeRule;
  canCancel?: boolean;
}

export interface EffectDefinition {
  action: EffectAction;
  params?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
}

export type ResponseType =
  | 'shan'
  | 'sha'
  | 'tao'
  | 'wuxie'
  | 'discard'
  | 'none';

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  subType?: TrickSubType | EquipmentSlot | null;
  description: string;
  /** 能否在出牌阶段主动打出 */
  canInitiate?: boolean;
  /** 每回合默认使用次数（杀=1） */
  defaultUsePerTurn?: number;
  targeting: TargetRule;
  effects: EffectDefinition[];
  /** 响应链类型（闪响应杀等） */
  responseTo?: ResponseType[];
  /** 作为判定延时锦囊时的判定条件 */
  judgeSuccess?: { suit?: string[]; color?: 'red' | 'black' };
}
