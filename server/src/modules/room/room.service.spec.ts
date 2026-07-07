import { describe, expect, it, vi } from 'vitest';
import { RoomService } from './room.service';
import { GameService } from '../game/game.service';

function createService(): RoomService {
  return new RoomService(new GameService());
}

function optionIds(service: RoomService, roomId: string, playerId: string): string[] {
  const options = (service as unknown as { generalOptionsByRoom: Map<string, Map<string, string[]>> }).generalOptionsByRoom;
  const id = roomId;
  return options.get(id)?.get(playerId) ?? [];
}

describe('RoomService formal general selection', () => {
  it('creates and starts a free china monopoly room with a typed room-list entry', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, 'user-host', 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二', 'user-2');

    expect(room.gameType).toBe('monopoly');
    expect(room.versionName).toBe('中国版大富翁');
    expect(room.maxPlayers).toBe(8);
    expect(room.monopoly?.phase).toBe('lobby');

    const listed = service.listPublicRooms(undefined, undefined, undefined, 'monopoly')[0];
    expect(listed).toEqual(expect.objectContaining({
      code: room.code,
      gameType: 'monopoly',
      gameName: '中国版大富翁',
      playerCount: 2,
    }));

    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    expect(room.status).toBe('playing');
    expect(room.monopoly).toEqual(expect.objectContaining({
      phase: 'playing',
      round: 1,
      pendingAction: null,
    }));
    expect(room.monopoly?.players.map((player) => player.cash)).toEqual([15000, 15000]);
    expect(room.monopoly?.board.some((cell) => cell.name === '北京')).toBe(true);
    expect(room.monopoly?.log[0]).toContain('游玩免费');
  });

  it('remaps monopoly player ids when an authenticated player rejoins after disconnect', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, 'user-host', 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二', 'user-2');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const state = room.monopoly!;
    state.board[1]!.ownerId = 'host';
    state.players[0]!.properties = [1];

    service.markPlayerDisconnected('host');
    expect(room.players[0]?.connected).toBe(false);

    const rebound = service.joinRoom(room.code, 'host-new', '房主', 'user-host');
    expect(rebound.players[0]?.connected).toBe(true);
    expect(rebound.players[0]?.id).toBe('host-new');
    expect(state.players[0]?.playerId).toBe('host-new');
    expect(state.board[1]?.ownerId).toBe('host-new');
  });

  it('serves jail turns without moving when rolling during imprisonment', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, undefined, 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const state = room.monopoly!;
    state.players[0]!.jailTurnsRemaining = 2;
    state.players[0]!.position = 39;

    service.monopolyRoll('host');
    expect(state.players[0]?.position).toBe(39);
    expect(state.players[0]?.jailTurnsRemaining).toBe(1);
    expect(state.turnIndex).toBe(1);
    expect(state.log.some((line) => line.includes('在监狱中服刑'))).toBe(true);
  });

  it('runs the monopoly roll and buy turn flow on the server state', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, undefined, 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const state = room.monopoly!;
    state.players[0]!.position = 39;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

    try {
      service.monopolyRoll('host');
      expect(state.players[0]).toEqual(expect.objectContaining({ position: 1, cash: 17000 }));
      expect(state.pendingAction).toBe('buy_or_skip');

      service.monopolyBuy('host');
      expect(state.board[1]?.ownerId).toBe('host');
      expect(state.players[0]?.cash).toBe(13800);
      expect(state.turnIndex).toBe(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('draws and applies a configured chance card when landing on a chance tile', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, undefined, 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const state = room.monopoly!;
    state.players[0]!.position = 5;
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    try {
      service.monopolyRoll('host');
      expect(state.players[0]?.position).toBe(0);
      expect(state.players[0]?.cash).toBe(17000);
      expect(state.turnIndex).toBe(1);
      expect(state.pendingAction).toBeNull();
      expect(state.log.some((line) => line.includes('抽到'))).toBe(true);
      expect(state.lastDrawnCard).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('advances turn after chance card moves to an owned rail and clears drawn card state', () => {
    const service = createService();
    const room = service.createRoom('host', '房主', undefined, undefined, 'monopoly');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const state = room.monopoly!;
    const railIndex = state.board.findIndex((cell) => cell.name === '沈阳火车站');
    expect(railIndex).toBeGreaterThan(-1);
    state.board[railIndex]!.ownerId = 'p2';
    state.players[0]!.position = 5;
    state.players[1]!.cash = 15000;

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(8 / 13);

    try {
      service.monopolyRoll('host');
      expect(state.players[0]?.position).toBe(railIndex);
      expect(state.turnIndex).toBe(1);
      expect(state.pendingAction).toBeNull();
      expect(state.lastDrawnCard).toBeNull();
      expect(state.players[0]?.cash).toBeLessThan(15000);
      expect(state.players[1]?.cash).toBeGreaterThan(15000);
      expect(state.log.some((line) => line.includes('火车站'))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('enforces standard-2014 player count boundaries from the version catalog', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');

    expect(room.versionId).toBe('standard-2014');
    expect(room.versionName).toBe('三国杀标准版·界限突破');
    expect(room.maxPlayers).toBe(8);
    expect(() => service.startGame('host')).toThrow('至少需要 2 名玩家');

    for (let i = 2; i <= 8; i += 1) {
      service.joinRoom(room.code, `p${i}`, `玩家${i}`);
    }

    expect(room.players).toHaveLength(8);
    expect(() => service.joinRoom(room.code, 'p9', '玩家9')).toThrow('房间已满');
  });

  it('binds authenticated joins for room-list return and rebinds selecting prompts', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二', 'user-2');

    expect(service.getPlayerIdByUser('user-2')).toBe('p2');
    const listedRoom = service
      .listPublicRooms(undefined, 'other-tab', 'user-2')
      .find((item) => item.code === room.code);
    expect(listedRoom?.joinLabel).toBe('返回');

    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const rebound = service.rebindUserPlayer('user-2', 'p2', 'p2-reconnected')!;
    expect(rebound.players.some((p) => p.id === 'p2-reconnected')).toBe(true);
    expect(service.getPlayerIdByUser('user-2')).toBe('p2-reconnected');

    const optionIdsAfterRebind = optionIds(service, room.id, 'p2-reconnected');
    expect(optionIdsAfterRebind).toHaveLength(3);
  });

  it('starts simultaneous selecting after identity assignment and exposes each player options', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);

    service.startGame('host');

    expect(room.status).toBe('selecting');
    expect(room.roomLifecycle?.state).toBe('selecting');
    const lord = room.players.find((p) => p.role === '主公')!;
    const rebel = room.players.find((p) => p.role !== '主公')!;
    expect(lord.roleRevealed).toBe(true);
    expect(rebel.roleRevealed).toBe(false);
    expect(optionIds(service, room.id, lord.id)).toHaveLength(5);
    expect(optionIds(service, room.id, rebel.id)).toHaveLength(3);

    const lordView = service.getFilteredRoomForPlayer(room.id, lord.id)!;
    const rebelView = service.getFilteredRoomForPlayer(room.id, rebel.id)!;
    expect(lordView.players.find((p) => p.id === lord.id)?.role).toBe('主公');
    expect(rebelView.players.find((p) => p.id === rebel.id)?.role).toBe(rebel.role);
    expect(lordView.players.find((p) => p.id === rebel.id)?.role).toBe('？');
    expect(rebelView.players.find((p) => p.id === lord.id)?.role).toBe('主公');
    expect(lordView.generalSelection?.myOptions).toHaveLength(5);
    expect(rebelView.generalSelection?.myOptions).toHaveLength(3);
    expect(lordView.generalSelection?.myOptions?.[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        kingdom: expect.stringMatching(/^(wei|shu|wu|qun)$/),
        hp: expect.any(Number),
        maxHp: expect.any(Number),
        skills: expect.any(Array),
      }),
    );
  });

  it('accepts picks in any order and starts the engine after all players pick', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.joinRoom(room.code, 'p3', '玩家三');
    room.players.forEach((p) => service.setReady(p.id, true));

    service.startGame('host');

    const nonLord = room.players.find((p) => p.role !== '主公')!;
    service.selectGeneral(nonLord.id, room.code, optionIds(service, room.id, nonLord.id)[0]!);
    expect(room.status).toBe('selecting');
    expect(room.generalSelection?.selected).toHaveLength(1);

    for (const player of room.players.filter((p) => p.id !== nonLord.id)) {
      service.selectGeneral(player.id, room.code, optionIds(service, room.id, player.id)[0]!);
    }

    expect(room.status).toBe('playing');
    expect(room.roomLifecycle?.state).toBe('playing');
    expect(room.generalSelection).toBeUndefined();
    expect(room.players.every((p) => p.general && p.hp != null && p.maxHp != null)).toBe(true);
    expect(room.players.every((p) => (p.handCards?.length ?? 0) >= 4)).toBe(true);
    expect(room.sandbox?.phase).toBe('playing');
  });

  it('timeout selects the first candidate server-side', () => {
    vi.useFakeTimers();
    try {
      const service = createService();
      const room = service.createRoom('host', '房主');
      service.joinRoom(room.code, 'p2', '玩家二');
      service.setReady('host', true);
      service.setReady('p2', true);

      service.startGame('host');
      const expected = room.players.map((player) => {
        const first = optionIds(service, room.id, player.id)[0]!;
        const firstName = service.getFilteredRoomForPlayer(room.id, player.id)!.generalSelection!.myOptions![0]!.name;
        return { playerId: player.id, generalId: first, generalName: firstName };
      });

      vi.advanceTimersByTime(room.generalSelection!.timeoutSec * 1000);

      expect(room.status).toBe('playing');
      expect(room.players).toEqual(
        expect.arrayContaining(
          expected.map((item) => expect.objectContaining({ id: item.playerId, general: item.generalName })),
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes a manual leaver during selection and transfers host when needed', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.joinRoom(room.code, 'p3', '玩家三');
    room.players.forEach((p) => service.setReady(p.id, true));

    service.startGame('host');

    const result = service.leaveRoom('host', 'manual');

    expect(result.removed).toBe(true);
    expect(result.disbanded).toBe(false);
    expect(result.penalty).toBe(5);
    expect(room.players.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(room.hostId).toBe('p2');
    expect(room.roomLifecycle).toMatchObject({ state: 'selecting', hostTransferPending: false });
    expect(optionIds(service, room.id, 'host')).toHaveLength(0);
    expect(service.getRoomOfPlayer('host')).toBeNull();
  });

  it('keeps a disconnected player seated without penalty', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);
    service.startGame('host');

    const result = service.leaveRoom('p2', 'disconnect');

    expect(result.removed).toBe(false);
    expect(result.penalty).toBeUndefined();
    expect(room.players.find((p) => p.id === 'p2')?.connected).toBe(false);
    expect(room.roomLifecycle?.state).toBe('selecting');
    expect(room.roomLifecycle?.disconnectGraceUntil).toBeGreaterThan(Date.now());
    expect(service.getRoomOfPlayer('p2')).toBe(room);
  });

  it('transfers host on disconnect while keeping the disconnected host seated', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.joinRoom(room.code, 'p3', '玩家三');
    room.players.forEach((p) => service.setReady(p.id, true));
    service.startGame('host');

    const result = service.leaveRoom('host', 'disconnect');

    expect(result.removed).toBe(false);
    expect(result.disbanded).toBe(false);
    expect(result.penalty).toBeUndefined();
    expect(result.previousHostId).toBe('host');
    expect(result.newHostId).toBe('p2');
    expect(room.hostId).toBe('p2');
    expect(room.players.map((p) => p.id)).toEqual(['host', 'p2', 'p3']);
    expect(room.players.find((p) => p.id === 'host')?.connected).toBe(false);
    expect(service.getRoomOfPlayer('host')).toBe(room);
    expect(room.roomLifecycle).toMatchObject({
      state: 'selecting',
      hostTransferPending: false,
    });
    expect(room.roomLifecycle?.disconnectGraceUntil).toBeGreaterThan(Date.now());
  });

  it('disbands when the only real host disconnects during selection', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    room.players.push({
      id: 'bot-1',
      nickname: '虚拟一',
      ready: true,
      connected: true,
      isVirtual: true,
    });
    service.setReady('host', true);
    service.startGame('host');

    const result = service.leaveRoom('host', 'disconnect');

    expect(result.removed).toBe(false);
    expect(result.disbanded).toBe(true);
    expect(result.previousRoomId).toBe(room.id);
    expect(service.getRoomById(room.id)).toBeNull();
  });

  it('marks disconnected players through the gateway helper while preserving their seat', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');

    const changed = service.markPlayerDisconnected('p2');

    expect(changed).toBe(room);
    expect(room.players.find((p) => p.id === 'p2')?.connected).toBe(false);
    expect(room.roomLifecycle).toMatchObject({ state: 'waiting' });
    expect(room.roomLifecycle?.disconnectGraceUntil).toBeGreaterThan(Date.now());
    expect(service.getRoomOfPlayer('p2')).toBe(room);
  });

  it('transfers host through the gateway disconnect helper while preserving the seat', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.joinRoom(room.code, 'p3', '玩家三');

    const changed = service.markPlayerDisconnected('host');

    expect(changed).toBe(room);
    expect(room.hostId).toBe('p2');
    expect(room.players.map((p) => p.id)).toEqual(['host', 'p2', 'p3']);
    expect(room.players.find((p) => p.id === 'host')?.connected).toBe(false);
    expect(service.getRoomOfPlayer('host')).toBe(room);
    expect(room.roomLifecycle).toMatchObject({
      state: 'waiting',
      hostTransferPending: false,
    });
    expect(room.roomLifecycle?.disconnectGraceUntil).toBeGreaterThan(Date.now());
  });

  it('recovers finished rooms back to waiting and clears ready states', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    room.players.forEach((p) => service.setReady(p.id, true));
    room.status = 'finished';
    room.roomLifecycle = { state: 'finished' };
    room.sandbox = {
      phase: 'finished',
      turnIndex: 0,
      round: 1,
      log: [],
      prompt: { type: 'play-card', playerId: 'host', message: 'x' },
      victory: { winners: ['host'], message: '胜利' },
    };

    const recovered = service.completeFinishedRoom(room.id);

    expect(recovered).toBe(room);
    expect(room.status).toBe('waiting');
    expect(room.roomLifecycle).toMatchObject({ state: 'waiting', hostTransferPending: false });
    expect(room.players.every((p) => !p.ready)).toBe(true);
    expect(room.sandbox?.phase).toBe('lobby');
    expect(room.sandbox?.prompt).toBeNull();
    expect(room.sandbox?.victory).toBeNull();
    expect(room.settlementRecords).toEqual([
      expect.objectContaining({
        winners: ['host'],
        message: '胜利',
      }),
    ]);
  });
});
