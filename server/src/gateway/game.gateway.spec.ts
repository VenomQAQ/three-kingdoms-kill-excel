import { describe, expect, it, vi } from 'vitest';
import type { Room } from '@tk/shared';
import { GameGateway } from './game.gateway';

function createGatewayHarness() {
  const room = {
    id: 'room-1',
    code: '12345678',
    status: 'selecting',
    roomLifecycle: { state: 'selecting' },
    hostId: 'host',
    players: [],
  } as unknown as Room;

  const update = vi.fn().mockReturnThis();
  const set = vi.fn().mockReturnThis();
  const where = vi.fn().mockReturnThis();
  const execute = vi.fn().mockResolvedValue(undefined);
  const queryBuilder = { update, set, where, execute };
  const userRepo = {
    createQueryBuilder: vi.fn(() => queryBuilder),
    findOne: vi.fn().mockResolvedValue({
      id: 'user-1',
      coins: 7,
      experience: 20,
      level: 2,
    }),
  };
  const socketAuth = { emitToUser: vi.fn() };
  const roomService = {
    getRoomOfPlayer: vi.fn().mockReturnValue(room),
    leaveRoom: vi.fn().mockReturnValue({ room, previousRoomId: room.id, penalty: 5 }),
  };

  const gateway = new GameGateway(
    roomService as never,
    {} as never,
    socketAuth as never,
    {} as never,
    {} as never,
    {} as never,
    userRepo as never,
  );
  (gateway as unknown as { server: unknown }).server = {
    in: vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue([]) })),
    to: vi.fn(() => ({ emit: vi.fn() })),
  };

  const client = {
    id: 'socket-1',
    data: { playerId: 'player-1', userId: 'user-1' },
    leave: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
  };

  return { client, execute, gateway, room, roomService, set, socketAuth, userRepo, where };
}

describe('GameGateway room lifecycle', () => {
  it('charges manual leave penalty and broadcasts the updated wallet in selecting state', async () => {
    const { client, execute, gateway, room, roomService, set, socketAuth, where } = createGatewayHarness();

    await gateway.handleLeave(client as never, { code: room.code, reason: 'manual' });

    expect(roomService.leaveRoom).toHaveBeenCalledWith('player-1', 'manual');
    expect(set).toHaveBeenCalledWith({ coins: expect.any(Function) });
    expect(where).toHaveBeenCalledWith('id = :userId', { userId: 'user-1' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(socketAuth.emitToUser).toHaveBeenCalledWith('user-1', 'user:walletChanged', {
      coins: 7,
      experience: 20,
      level: 2,
      reason: 'manual-leave',
      _v: 1,
    });
    expect(client.leave).toHaveBeenCalledWith(room.id);
  });

  it('does not charge wallet on disconnect leave even if the room is selecting', async () => {
    const { client, execute, gateway, room, roomService, socketAuth } = createGatewayHarness();
    roomService.leaveRoom.mockReturnValueOnce({ room, previousRoomId: room.id });

    await gateway.handleLeave(client as never, { code: room.code, reason: 'disconnect' });

    expect(roomService.leaveRoom).toHaveBeenCalledWith('player-1', 'disconnect');
    expect(execute).not.toHaveBeenCalled();
    expect(socketAuth.emitToUser).not.toHaveBeenCalled();
  });
});
