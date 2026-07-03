/**
 * 标准牌堆（牌名配置，按常见 108 张牌局比例简化）
 * 花色/点数后续可在 CardInstance 层扩展
 */
const DECK_COUNTS: Record<string, number> = {
  杀: 30,
  闪: 15,
  桃: 8,
  酒: 5,
  过河拆桥: 6,
  顺手牵羊: 5,
  无中生有: 4,
  决斗: 3,
  南蛮入侵: 3,
  万箭齐发: 1,
  桃园结义: 1,
  五谷丰登: 2,
  借刀杀人: 2,
  无懈可击: 4,
  乐不思蜀: 3,
  兵粮寸断: 2,
  闪电: 1,
  诸葛连弩: 1,
  青釭剑: 1,
  青龙偃月刀: 1,
  丈八蛇矛: 1,
  贯石斧: 1,
  方天画戟: 1,
  麒麟弓: 1,
  仁王盾: 1,
  八卦阵: 1,
  的卢马: 1,
  绝影: 1,
  赤兔: 1,
  大宛: 1,
  紫骍: 1,
  木牛流马: 1,
};

export function buildStandardDeck(): string[] {
  const pile: string[] = [];
  for (const [name, count] of Object.entries(DECK_COUNTS)) {
    for (let i = 0; i < count; i++) pile.push(name);
  }
  return pile;
}

export function shuffleDeck(cards: string[]): string[] {
  const pile = [...cards];
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pile[i], pile[j]] = [pile[j]!, pile[i]!];
  }
  return pile;
}

export function createShuffledDeck(): string[] {
  return shuffleDeck(buildStandardDeck());
}
