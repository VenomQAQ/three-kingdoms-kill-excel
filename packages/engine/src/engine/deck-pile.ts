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

  discardCard(entry: string): void {
    this.discard.push(cardNameFromHandEntry(entry));
  }

  remaining(): number {
    return this.draw.length;
  }
}
