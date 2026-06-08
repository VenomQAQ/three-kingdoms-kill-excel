export const SUITS = ['♠', '♥', '♣', '♦'] as const;
export type Suit = (typeof SUITS)[number];

export interface CardInstance {
  name: string;
  suit: Suit;
  point: number;
}

export function randomSuit(): Suit {
  return SUITS[Math.floor(Math.random() * 4)]!;
}

export function randomPoint(): number {
  return Math.floor(Math.random() * 13) + 1;
}

export function createCardInstance(name: string): CardInstance {
  return { name, suit: randomSuit(), point: randomPoint() };
}

export function isRed(instance: CardInstance): boolean {
  return instance.suit === '♥' || instance.suit === '♦';
}

export function isBlack(instance: CardInstance): boolean {
  return instance.suit === '♠' || instance.suit === '♣';
}

export function formatCardInstance(c: CardInstance): string {
  return `${c.suit}${c.point}【${c.name}】`;
}

/** 延时锦囊判定是否生效（跳过阶段） */
export function judgeDelayEffect(judgeCardName: string, result: CardInstance): boolean {
  if (judgeCardName === '乐不思蜀') return !isRed(result);
  if (judgeCardName === '兵粮寸断') return !isBlack(result);
  if (judgeCardName === '闪电') return result.suit === '♠' && result.point >= 2 && result.point <= 9;
  return false;
}
