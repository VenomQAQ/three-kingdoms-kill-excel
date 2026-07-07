import type {
  MonopolyBoardCell,
  MonopolyCardDef,
  MonopolyCardEffect,
  MonopolyGameState,
  MonopolyPlayerState,
} from '@tk/shared';
import {
  MONOPOLY_RULES,
  canUpgradeCell,
  countPropertyBuildings,
  resolveCellRent,
  resolveCellUpgradeCost,
} from '@tk/shared';

export interface MonopolyCellResolveOptions {
  rentMultiplier?: number;
}

export interface MonopolyCellResolveResult {
  pendingAction: MonopolyGameState['pendingAction'];
}

function findCellByName(board: MonopolyBoardCell[], name: string): MonopolyBoardCell | undefined {
  return board.find((cell) => cell.name === name);
}

function countPropertyRepair(player: MonopolyPlayerState, board: MonopolyBoardCell[]): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const index of player.properties) {
    const cell = board[index];
    if (!cell || cell.ownerId !== player.playerId) continue;
    const counts = countPropertyBuildings(cell, MONOPOLY_RULES.houseLevel, MONOPOLY_RULES.hotelLevel);
    houses += counts.houses;
    hotels += counts.hotels;
  }
  return { houses, hotels };
}

function isPurchasable(cell: MonopolyBoardCell): boolean {
  return (cell.type === 'city' || cell.type === 'rail' || cell.type === 'utility') && !cell.ownerId;
}

function forwardDistance(from: number, to: number, boardLength: number): number {
  return (to - from + boardLength) % boardLength;
}

function findNearestRailForward(board: MonopolyBoardCell[], fromPosition: number): MonopolyBoardCell {
  const rails = board.filter((cell) => cell.type === 'rail');
  let best = rails[0]!;
  let bestDistance = board.length;
  for (const rail of rails) {
    const distance = forwardDistance(fromPosition, rail.index, board.length);
    const normalized = distance === 0 ? board.length : distance;
    if (normalized < bestDistance) {
      bestDistance = normalized;
      best = rail;
    }
  }
  return best;
}

function findNearestPlayer(
  players: MonopolyPlayerState[],
  playerId: string,
  boardLength: number,
): MonopolyPlayerState | null {
  const current = players.find((player) => player.playerId === playerId);
  if (!current) return null;
  let nearest: MonopolyPlayerState | null = null;
  let nearestDistance = boardLength;
  for (const other of players) {
    if (other.playerId === playerId) continue;
    const distance = Math.min(
      forwardDistance(current.position, other.position, boardLength),
      forwardDistance(other.position, current.position, boardLength),
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = other;
    }
  }
  return nearest;
}

export function resolveMonopolyLandingCell(
  state: MonopolyGameState,
  playerId: string,
  cellIndex: number,
  options: MonopolyCellResolveOptions = {},
): MonopolyCellResolveResult {
  const player = state.players.find((item) => item.playerId === playerId);
  const cell = state.board[cellIndex];
  if (!player || !cell) return { pendingAction: null };

  if (isPurchasable(cell)) {
    state.pendingAction = 'buy_or_skip';
    state.log.push(`${cell.name} 尚未归属，可用 ${cell.price} 金币购买`);
    return { pendingAction: 'buy_or_skip' };
  }

  if (cell.type === 'city' && cell.ownerId === playerId && canUpgradeCell(cell)) {
    const cost = resolveCellUpgradeCost(cell);
    if (cost != null) {
      state.pendingAction = 'upgrade_or_skip';
      state.log.push(`${cell.name} 可升级，费用 ${cost} 金币`);
      return { pendingAction: 'upgrade_or_skip' };
    }
  } else if (cell.type === 'city' && cell.ownerId === playerId) {
    state.log.push(`${cell.name} 已满级，跳过升级`);
  }

  const rentMultiplier = options.rentMultiplier ?? 1;
  if ((cell.type === 'city' || cell.type === 'rail' || cell.type === 'utility') && cell.ownerId && cell.ownerId !== playerId) {
    const owner = state.players.find((item) => item.playerId === cell.ownerId);
    const owed = resolveCellRent(cell, { board: state.board, ownerId: cell.ownerId, rentMultiplier });
    const paid = Math.min(player.cash, owed);
    player.cash -= paid;
    if (owner) owner.cash += paid;
    const multiplierText = rentMultiplier > 1 ? `（${rentMultiplier} 倍）` : '';
    state.log.push(`${player.nickname} 向 ${owner?.nickname ?? '地主'} 支付 ${paid} 金币过路费${multiplierText}`);
  } else if (cell.type === 'tax') {
    const owed = resolveCellRent(cell, { board: state.board, rentMultiplier });
    const paid = Math.min(player.cash, owed);
    player.cash -= paid;
    state.log.push(`${player.nickname} 缴纳税费 ${paid} 金币`);
  }

  return { pendingAction: null };
}

export function applyMonopolyCard(
  state: MonopolyGameState,
  playerId: string,
  card: MonopolyCardDef,
  pool: 'chance' | 'fate',
): MonopolyCellResolveResult {
  const player = state.players.find((item) => item.playerId === playerId);
  if (!player) return { pendingAction: null };

  state.lastDrawnCard = { pool, id: card.id, text: card.text };
  state.log.push(`${player.nickname} 抽到：${card.text}`);

  let landingOptions: MonopolyCellResolveOptions | undefined;
  let moved = false;

  for (const effect of card.effects) {
    const result = applyMonopolyCardEffect(state, player, effect);
    if (result.moved) moved = true;
    if (result.landingOptions) landingOptions = result.landingOptions;
  }

  if (moved) {
    return resolveMonopolyLandingCell(state, playerId, player.position, landingOptions ?? {});
  }
  return { pendingAction: null };
}

interface EffectApplyResult {
  moved: boolean;
  landingOptions?: MonopolyCellResolveOptions;
}

function applyMonopolyCardEffect(
  state: MonopolyGameState,
  player: MonopolyPlayerState,
  effect: MonopolyCardEffect,
): EffectApplyResult {
  const boardLength = state.board.length;

  switch (effect.type) {
    case 'move_to_start': {
      player.position = 0;
      const bonus = effect.landBonus ?? 0;
      if (bonus > 0) {
        player.cash += bonus;
        state.log.push(`${player.nickname} 到达起点，领取 ${bonus} 金币`);
      }
      return { moved: true };
    }
    case 'move_to_cell': {
      const target = findCellByName(state.board, effect.targetName ?? '');
      if (!target) return { moved: false };
      const from = player.position;
      if (effect.passStartBonus && target.index < from) {
        player.cash += effect.passStartBonus;
        state.log.push(`${player.nickname} 经过起点，获得 ${effect.passStartBonus} 金币`);
      }
      player.position = target.index;
      state.log.push(`${player.nickname} 前往 ${target.name}`);
      return { moved: true };
    }
    case 'move_steps': {
      const steps = effect.steps ?? 0;
      if (steps === 0) return { moved: false };
      if (steps > 0 && player.position + steps >= boardLength && effect.passStartBonus) {
        player.cash += effect.passStartBonus;
        state.log.push(`${player.nickname} 经过起点，获得 ${effect.passStartBonus} 金币`);
      }
      player.position = (player.position + steps + boardLength * 10) % boardLength;
      state.log.push(`${player.nickname} ${steps > 0 ? '前进' : '后退'} ${Math.abs(steps)} 格`);
      return { moved: true };
    }
    case 'go_to_jail': {
      const jail = findCellByName(state.board, effect.targetName ?? MONOPOLY_RULES.jailCellName);
      if (jail) {
        player.position = jail.index;
        state.log.push(`${player.nickname} 被送入 ${jail.name}`);
      }
      return { moved: true };
    }
    case 'collect_bank': {
      const amount = effect.amount ?? 0;
      player.cash += amount;
      state.log.push(`${player.nickname} 从银行领取 ${amount} 金币`);
      return { moved: false };
    }
    case 'pay_bank': {
      const amount = effect.amount ?? 0;
      const paid = Math.min(player.cash, amount);
      player.cash -= paid;
      state.log.push(`${player.nickname} 向银行支付 ${paid} 金币`);
      return { moved: false };
    }
    case 'collect_from_each_player': {
      const amount = effect.amount ?? 0;
      let total = 0;
      for (const other of state.players) {
        if (other.playerId === player.playerId) continue;
        const paid = Math.min(other.cash, amount);
        other.cash -= paid;
        player.cash += paid;
        total += paid;
        if (paid > 0) {
          state.log.push(`${other.nickname} 向 ${player.nickname} 支付 ${paid} 金币`);
        }
      }
      if (total === 0) {
        state.log.push(`${player.nickname} 未能从其他玩家处收到金币`);
      }
      return { moved: false };
    }
    case 'property_repair': {
      const { houses, hotels } = countPropertyRepair(player, state.board);
      const houseAmount = effect.houseAmount ?? 0;
      const hotelAmount = effect.hotelAmount ?? 0;
      const owed = houses * houseAmount + hotels * hotelAmount;
      const paid = Math.min(player.cash, owed);
      player.cash -= paid;
      state.log.push(
        `${player.nickname} 缴纳修缮费 ${paid} 金币（${houses} 栋房子 × ${houseAmount}，${hotels} 家旅馆 × ${hotelAmount}）`,
      );
      return { moved: false };
    }
    case 'move_to_nearest_rail': {
      const rail = findNearestRailForward(state.board, player.position);
      const from = player.position;
      if (effect.passStartBonus && rail.index < from) {
        player.cash += effect.passStartBonus;
        state.log.push(`${player.nickname} 经过起点，获得 ${effect.passStartBonus} 金币`);
      }
      player.position = rail.index;
      state.log.push(`${player.nickname} 前往最近的 ${rail.name}`);
      return {
        moved: true,
        landingOptions: { rentMultiplier: effect.rentMultiplier ?? 1 },
      };
    }
    case 'swap_nearest_player': {
      const nearest = findNearestPlayer(state.players, player.playerId, boardLength);
      if (!nearest) {
        state.log.push(`${player.nickname} 附近没有其他玩家，无法交换位置`);
        return { moved: false };
      }
      const myPosition = player.position;
      player.position = nearest.position;
      nearest.position = myPosition;
      state.log.push(`${player.nickname} 与 ${nearest.nickname} 交换位置`);
      return { moved: false };
    }
    default:
      return { moved: false };
  }
}

export function drawRandomMonopolyCard(
  pool: 'chance' | 'fate',
  cards: MonopolyCardDef[],
  random = Math.random,
): MonopolyCardDef {
  return cards[Math.floor(random() * cards.length)]!;
}
