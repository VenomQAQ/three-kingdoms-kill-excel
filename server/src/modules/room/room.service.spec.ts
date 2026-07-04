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

  it('starts selecting after identity assignment and exposes only current player options', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.setReady('host', true);
    service.setReady('p2', true);

    service.startGame('host');

    expect(room.status).toBe('selecting');
    const lord = room.players.find((p) => p.role === '主公')!;
    const rebel = room.players.find((p) => p.role !== '主公')!;
    expect(room.generalSelection?.currentPlayerId).toBe(lord.id);
    expect(lord.roleRevealed).toBe(true);
    expect(rebel.roleRevealed).toBe(false);
    expect(optionIds(service, room.id, lord.id)).toHaveLength(5);
    expect(optionIds(service, room.id, rebel.id)).toHaveLength(3);

    const lordView = service.getFilteredRoomForPlayer(room.id, lord.id)!;
    const rebelView = service.getFilteredRoomForPlayer(room.id, rebel.id)!;
    expect(lordView.generalSelection?.myOptions).toHaveLength(5);
    expect(rebelView.generalSelection?.myOptions).toBeUndefined();
  });

  it('advances from lord to the next seat and starts the engine after all picks', () => {
    const service = createService();
    const room = service.createRoom('host', '房主');
    service.joinRoom(room.code, 'p2', '玩家二');
    service.joinRoom(room.code, 'p3', '玩家三');
    room.players.forEach((p) => service.setReady(p.id, true));

    service.startGame('host');

    const lord = room.players.find((p) => p.role === '主公')!;
    service.selectGeneral(lord.id, room.code, optionIds(service, room.id, lord.id)[0]!);

    const nextSeat = room.players[(room.players.findIndex((p) => p.id === lord.id) + 1) % room.players.length]!;
    expect(room.generalSelection?.currentPlayerId).toBe(nextSeat.id);

    while (room.status === 'selecting') {
      const currentId = room.generalSelection!.currentPlayerId;
      service.selectGeneral(currentId, room.code, optionIds(service, room.id, currentId)[0]!);
    }

    expect(room.status).toBe('playing');
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
      const currentId = room.generalSelection!.currentPlayerId;
      const first = optionIds(service, room.id, currentId)[0]!;
      const firstName = service.getFilteredRoomForPlayer(room.id, currentId)!.generalSelection!.myOptions![0]!.name;

      vi.advanceTimersByTime(room.generalSelection!.timeoutSec * 1000);

      expect(room.generalSelection?.selected).toContainEqual({
        playerId: currentId,
        generalId: first,
        generalName: firstName,
      });
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
    expect(room.generalSelection?.currentPlayerId).not.toBe('host');
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
    expect(service.getRoomOfPlayer('p2')).toBe(room);
  });
});
