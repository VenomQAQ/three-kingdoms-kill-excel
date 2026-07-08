import type { CardDefinition, EffectDefinition } from '../types/card';
import type { EnginePlayerState } from '../types/game';
import { CardRegistry } from '../registry/card-registry';
import { cardNameFromHandEntry, formatHandEntryForLog, handEntriesMatch } from './card-label';
import { createCardInstance, isBlack } from './card-instance';
import type { DeckPile } from './deck-pile';
import {
  discardOneFromZone,
  equipToSlot,
  sourceIgnoresArmor,
  takeOneFromZone,
} from './equipment-zone';

export interface EffectContext {
  source: EnginePlayerState;
  targets: EnginePlayerState[];
  card: CardDefinition;
  log: (msg: string) => void;
  deck?: DeckPile;
  onLostEquipment?: (player: EnginePlayerState, lostCount: number) => void;
}

/** 执行配置化效果原语（L1） */
export function runCardEffects(ctx: EffectContext): void {
  for (const effect of ctx.card.effects) {
    switch (effect.action) {
      case 'draw': {
        const count = (effect.params?.count as number) ?? 1;
        const all = effect.params?.all as boolean;
        if (all) {
          for (const p of ctx.targets.length ? ctx.targets : [ctx.source]) {
            drawCards(p, count, ctx.log);
          }
        } else {
          drawCards(ctx.source, count, ctx.log, ctx.deck);
        }
        break;
      }
      case 'recover': {
        const amount = (effect.params?.amount as number) ?? 1;
        const all = effect.params?.all as boolean;
        const list = all ? ctx.targets : ctx.targets.length ? ctx.targets : [ctx.source];
        for (const p of list) {
          if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + amount);
            ctx.log(`${p.generalName} 回复 ${amount} 点体力（${p.hp}/${p.maxHp}）`);
          }
        }
        break;
      }
      case 'damage': {
        const amount = (effect.params?.amount as number) ?? 1;
        for (const t of ctx.targets) {
          t.hp = Math.max(0, t.hp - amount);
          ctx.log(`${t.generalName} 受到 ${amount} 点伤害（${t.hp}/${t.maxHp}）`);
        }
        break;
      }
      case 'equip': {
        const lostCount = equipToSlot(ctx.source, ctx.card, ctx.deck, ctx.log);
        ctx.onLostEquipment?.(ctx.source, lostCount);
        break;
      }
      case 'discard': {
        const count = (effect.params?.count as number) ?? 1;
        const zone = (effect.params?.zone as string) ?? 'hand';
        for (const t of ctx.targets) {
          for (let i = 0; i < count; i++) {
            const z =
              zone === 'any' ? 'any' : zone === 'equipment' ? 'equipment' : 'hand';
            const equipmentCountBefore = t.equipment.length;
            if (!discardOneFromZone(t, z, ctx.deck, ctx.log)) break;
            ctx.onLostEquipment?.(t, equipmentCountBefore - t.equipment.length);
          }
        }
        break;
      }
      case 'moveCard': {
        const count = (effect.params?.count as number) ?? 1;
        for (const t of ctx.targets) {
          for (let i = 0; i < count; i++) {
            const equipmentCountBefore = t.equipment.length;
            if (!takeOneFromZone(t, ctx.source, ctx.deck, ctx.log)) break;
            ctx.onLostEquipment?.(t, equipmentCountBefore - t.equipment.length);
          }
        }
        break;
      }
      case 'giveCards':
        break;
      case 'judge': {
        if (effect.params?.placeInJudge) {
          for (const t of ctx.targets.length ? ctx.targets : [ctx.source]) {
            t.judgeCards.push(ctx.card.name);
            ctx.log(`${t.generalName} 判定区置入【${ctx.card.name}】`);
          }
        }
        break;
      }
      case 'chooseOption': {
        const buff = effect.params?.buff as string | undefined;
        if (buff === 'sha_damage_plus_1') {
          ctx.source.skillUseCount['_jiu_buff'] = 1;
          ctx.log(`${ctx.source.generalName} 使用【酒】，本回合下一张【杀】伤害+1`);
        }
        break;
      }
      default:
        break;
    }
  }
}

function drawCards(
  player: EnginePlayerState,
  count: number,
  log: (m: string) => void,
  deck?: DeckPile,
): void {
  const drawn = deck ? deck.drawMany(count) : [];
  if (drawn.length > 0) {
    player.handCards.push(...drawn);
  } else {
    const fallback = ['杀', '闪', '桃', '酒', '过河拆桥', '无中生有'];
    for (let i = 0; i < count; i++) {
      player.handCards.push(fallback[Math.floor(Math.random() * fallback.length)]!);
    }
  }
  log(`${player.generalName} 摸 ${count} 张牌`);
}

export function removeCardFromHand(
  player: EnginePlayerState,
  cardName: string,
  handIndex?: number,
): boolean {
  const idx =
    handIndex != null && handIndex >= 0 && handIndex < player.handCards.length
      ? handIndex
      : player.handCards.findIndex((c) => handEntriesMatch(c, cardName));
  if (idx < 0 || !handEntriesMatch(player.handCards[idx]!, cardName)) return false;
  player.handCards.splice(idx, 1);
  return true;
}

export function hasRenwangShield(target: EnginePlayerState): boolean {
  return target.equipment.some((e) => e.includes('仁王盾'));
}

const HAND_LABEL_RE = /^[♠♥♣♦]\d{1,2}【.+】$/;

/** 仁王盾：黑色杀无效（无花色时视为可被仁王盾挡） */
export function shaBlockedByArmor(
  source: EnginePlayerState,
  target: EnginePlayerState,
  shaCardEntry?: string,
): boolean {
  if (sourceIgnoresArmor(source)) return false;
  if (!hasRenwangShield(target)) return false;
  if (!shaCardEntry) return true;
  const trimmed = shaCardEntry.trim();
  if (!HAND_LABEL_RE.test(trimmed)) return true;
  return isBlack(createCardInstance(trimmed));
}

export function formatRenwangBlockedLog(targetName: string, shaCardEntry?: string): string {
  const cardLabel = formatHandEntryForLog(shaCardEntry ?? '杀');
  return `【仁王盾】生效，${cardLabel} 对 ${targetName} 无效`;
}

export function getPromptResponseEffect(card: CardDefinition | undefined) {
  return card?.effects?.find((e) => e.action === 'promptResponse');
}

export function getResponseTypeFromEffect(
  card: CardDefinition | undefined,
): string | undefined {
  return getPromptResponseEffect(card)?.params?.responseType as string | undefined;
}

export function isAoeCard(card: CardDefinition | undefined): boolean {
  return !!getPromptResponseEffect(card)?.params?.aoe;
}

export function getOnFailEffects(card: CardDefinition | undefined): EffectDefinition[] {
  return (getPromptResponseEffect(card)?.params?.onFail as EffectDefinition[]) ?? [];
}

export function validResponseCards(
  responseType: string,
  hand: string[],
): string[] {
  const allowed = CardRegistry.cardsForResponse(responseType);
  return hand.filter((c) => allowed.includes(cardNameFromHandEntry(c)));
}
