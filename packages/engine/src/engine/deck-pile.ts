import { createShuffledDeck } from '../config/deck';
import { createCardInstance } from './card-instance';
import { cardNameFromHandEntry, formatHandCard } from './card-label';

/** 摸牌堆存牌名；入手牌时带花色点数 */
export class DeckPile {
  private draw: string[] = [];
  private discard: string[] = [];

  reset(): void {
    this.draw = createShuffledDeck();
    this.discard = [];
  }

  drawOne(): string | undefined {
    if (this.draw.length === 0) {
      if (this.discard.length === 0) return undefined;
      this.draw = createShuffledDeck();
      this.discard = [];
    }
    const name = this.draw.pop();
    if (!name) return undefined;
    return formatHandCard(createCardInstance(name));
  }

  drawMany(count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = this.drawOne();
      if (!c) break;
      out.push(c);
    }
    return out;
  }

  peekTop(count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = this.draw[this.draw.length - 1 - i];
      if (!name) break;
      out.push(formatHandCard(createCardInstance(name)));
    }
    return out;
  }

  arrangeTop(cards: string[], topCount: number): void {
    const names = cards.map((card) => cardNameFromHandEntry(card));
    this.draw.splice(Math.max(0, this.draw.length - names.length), names.length);
    const top = names.slice(0, topCount);
    const bottom = names.slice(topCount);
    this.draw.unshift(...bottom.reverse());
    this.draw.push(...top.reverse());
  }

  discardCard(entry: string): void {
    this.discard.push(cardNameFromHandEntry(entry));
  }

  remaining(): number {
    return this.draw.length;
  }
}
