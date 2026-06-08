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
