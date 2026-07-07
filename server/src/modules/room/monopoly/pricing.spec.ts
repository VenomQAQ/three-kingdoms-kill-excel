import { describe, expect, it } from 'vitest';
import { MONOPOLY_BOARD } from '@tk/shared';
import {
  getMonopolyPropertyTemplate,
  resolveCellRent,
  resolveCellUpgradeCost,
} from '@tk/shared';

describe('monopoly pricing config', () => {
  it('reads city rent and upgrade cost from property template levels', () => {
    const suzhou = MONOPOLY_BOARD.find((cell) => cell.name === '苏州')!;
    expect(suzhou.propertyTemplateId).toBe('city-green-a');
    expect(resolveCellRent(suzhou, { board: MONOPOLY_BOARD })).toBe(420);
    expect(resolveCellUpgradeCost(suzhou)).toBe(1800);

    suzhou.level = 2;
    expect(resolveCellRent(suzhou, { board: MONOPOLY_BOARD })).toBe(760);
    expect(resolveCellUpgradeCost(suzhou)).toBe(2400);

    suzhou.level = 3;
    expect(resolveCellRent(suzhou, { board: MONOPOLY_BOARD })).toBe(1160);
    expect(resolveCellUpgradeCost(suzhou)).toBeNull();
  });

  it('scales rail rent by total owned rail count from template config', () => {
    const board = MONOPOLY_BOARD.map((cell) => ({ ...cell }));
    board[5] = { ...board[5]!, ownerId: 'p1' };
    board[15] = { ...board[15]!, ownerId: 'p1' };
    const rail = board[5]!;
    expect(resolveCellRent(rail, { board, ownerId: 'p1' })).toBe(640);

    board[33] = { ...board[33]!, ownerId: 'p1' };
    expect(resolveCellRent(rail, { board, ownerId: 'p1' })).toBe(1280);
  });

  it('uses parking rail template rents independently', () => {
    const template = getMonopolyPropertyTemplate('rail-parking');
    expect(template?.kind).toBe('rail');
    if (template?.kind !== 'rail') return;
    expect(template.rentsByOwnershipCount).toEqual([260, 520, 1040, 2080]);
  });

  it('reads tax amount from tax template', () => {
    const tax = MONOPOLY_BOARD.find((cell) => cell.name === '所得税')!;
    expect(resolveCellRent(tax, { board: MONOPOLY_BOARD })).toBe(2000);
  });
});
