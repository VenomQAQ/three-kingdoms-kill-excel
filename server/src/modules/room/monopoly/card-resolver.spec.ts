import { describe, expect, it, vi } from 'vitest';
import type { MonopolyGameState } from '@tk/shared';
import { MONOPOLY_BOARD, MONOPOLY_CHANCE_CARDS, MONOPOLY_FATE_CARDS, MONOPOLY_RULES } from '@tk/shared';
import { applyMonopolyCard, drawRandomMonopolyCard } from './card-resolver';

function createState(overrides: Partial<MonopolyGameState> = {}): MonopolyGameState {
  return {
    phase: 'playing',
    turnIndex: 0,
    round: 1,
    board: MONOPOLY_BOARD.map((cell) => ({ ...cell })),
    players: [
      { playerId: 'p1', nickname: '玩家一', position: 10, cash: 15000, properties: [] },
      { playerId: 'p2', nickname: '玩家二', position: 20, cash: 15000, properties: [] },
    ],
    log: [],
    pendingAction: null,
    ...overrides,
  };
}

describe('monopoly card resolver', () => {
  it('draws a configured chance card randomly', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const card = drawRandomMonopolyCard('chance', MONOPOLY_CHANCE_CARDS);
      expect(card).toBe(MONOPOLY_CHANCE_CARDS[0]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('applies collect_bank effect from fate card config', () => {
    const state = createState();
    const card = MONOPOLY_FATE_CARDS.find((item) => item.id === 'fate-04')!;
    applyMonopolyCard(state, 'p1', card, 'fate');
    expect(state.players[0]?.cash).toBe(16000);
    expect(state.lastDrawnCard).toEqual(expect.objectContaining({ id: 'fate-04', pool: 'fate' }));
  });

  it('applies move_to_start with land bonus', () => {
    const state = createState({ players: [{ playerId: 'p1', nickname: '玩家一', position: 18, cash: 15000, properties: [] }] });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-01')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.position).toBe(0);
    expect(state.players[0]?.cash).toBe(17000);
  });

  it('applies go_to_jail without pass-start bonus', () => {
    const state = createState({ players: [{ playerId: 'p1', nickname: '玩家一', position: 5, cash: 15000, properties: [] }] });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-04')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.position).toBe(39);
    expect(state.players[0]?.cash).toBe(15000);
  });

  it('applies move_to_cell with pass-start bonus when wrapping', () => {
    const state = createState({ players: [{ playerId: 'p1', nickname: '玩家一', position: 38, cash: 15000, properties: [] }] });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-08')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.position).toBe(36);
    expect(state.players[0]?.cash).toBe(15000 + MONOPOLY_RULES.passStartBonus);
  });

  it('collects from each other player for chairman card', () => {
    const state = createState({
      players: [
        { playerId: 'p1', nickname: '玩家一', position: 0, cash: 15000, properties: [] },
        { playerId: 'p2', nickname: '玩家二', position: 5, cash: 1000, properties: [] },
        { playerId: 'p3', nickname: '玩家三', position: 8, cash: 800, properties: [] },
      ],
    });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-07')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.cash).toBe(15000 + 500 + 500);
    expect(state.players[1]?.cash).toBe(500);
    expect(state.players[2]?.cash).toBe(300);
  });

  it('swaps position with the nearest player', () => {
    const state = createState({
      players: [
        { playerId: 'p1', nickname: '玩家一', position: 10, cash: 15000, properties: [] },
        { playerId: 'p2', nickname: '玩家二', position: 12, cash: 15000, properties: [] },
      ],
    });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-13')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.position).toBe(12);
    expect(state.players[1]?.position).toBe(10);
  });

  it('charges property repair based on configured house and hotel levels', () => {
    const board = MONOPOLY_BOARD.map((cell) => ({ ...cell }));
    board[1] = { ...board[1]!, ownerId: 'p1', level: 2 };
    board[3] = { ...board[3]!, ownerId: 'p1', level: 3 };
    const state = createState({
      board,
      players: [{ playerId: 'p1', nickname: '玩家一', position: 7, cash: 5000, properties: [1, 3] }],
    });
    const card = MONOPOLY_CHANCE_CARDS.find((item) => item.id === 'chance-05')!;
    applyMonopolyCard(state, 'p1', card, 'chance');
    expect(state.players[0]?.cash).toBe(5000 - 500 - 1000);
  });
});
