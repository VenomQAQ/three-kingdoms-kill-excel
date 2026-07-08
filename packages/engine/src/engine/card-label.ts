import type { CardInstance } from './card-instance';
import { createCardInstance, formatCardInstance } from './card-instance';

const HAND_LABEL_RE = /^[♠♥♣♦]\d{1,2}【.+】$/;

/** 从手牌展示串解析牌名（支持 ♥3【杀】 或 杀） */
export function cardNameFromHandEntry(entry: string): string {
  const m = entry.match(/【(.+?)】$/);
  return m ? m[1]! : entry.trim();
}

export function formatHandCard(instance: CardInstance): string {
  return formatCardInstance(instance);
}

/** 无花色点数时补全为 ♠3【杀】 格式 */
export function normalizeHandEntry(entry: string): string {
  const trimmed = entry.trim();
  if (HAND_LABEL_RE.test(trimmed)) return trimmed;
  return formatCardInstance(createCardInstance(cardNameFromHandEntry(trimmed)));
}

export function handEntriesMatch(a: string, b: string): boolean {
  return cardNameFromHandEntry(a) === cardNameFromHandEntry(b);
}

/** 改判：优先按完整手牌条目匹配，避免客户端与引擎手牌顺序不一致 */
export function resolveHandPickIndex(
  handCards: string[],
  handIndex: number,
  handCardEntry?: string,
): number {
  const trimmed = handCardEntry?.trim();
  if (trimmed) {
    const exact = handCards.findIndex((entry) => entry === trimmed);
    if (exact >= 0) return exact;
    const byName = handCards.findIndex((entry) => handEntriesMatch(entry, trimmed));
    if (byName >= 0) return byName;
    return -1;
  }
  if (handIndex < 0 || handIndex >= handCards.length) return -1;
  return handIndex;
}

/** 日志/文案中展示手牌条目（保留花色点数，纯牌名包【】） */
export function formatHandEntryForLog(entry: string): string {
  const trimmed = entry.trim();
  if (HAND_LABEL_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('【') && trimmed.endsWith('】')) return trimmed;
  return `【${cardNameFromHandEntry(trimmed)}】`;
}
