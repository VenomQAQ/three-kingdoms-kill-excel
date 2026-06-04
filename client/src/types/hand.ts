/** 手牌区选中项（按下标区分同名牌） */
export type HandCardPick = { name: string; index: number };

/** 解析 ♥3【杀】 或 杀 */
export function cardNameFromHand(entry: string): string {
  const m = entry.match(/【(.+?)】$/);
  return m ? m[1]! : entry.trim();
}

export function isHandSelected(
  pick: HandCardPick | null,
  card: string,
  index: number,
): boolean {
  return pick != null && pick.index === index && pick.name === card;
}
