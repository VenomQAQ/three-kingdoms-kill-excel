import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientToServerEvents,
  Room,
  RoomCreateAck,
  RoomJoinAck,
  RoomLeaveReason,
  ServerToClientEvents,
} from '@tk/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { findVersion } from '@tk/shared';
import { env } from '../config/env';
import { ChatError, ChatService } from '../modules/chat/chat.service';
import { RoomError, RoomService } from '../modules/room/room.service';
import { ReconnectService } from '../modules/room/reconnect.service';
import { SocketAuthService } from '../modules/auth/socket-auth.service';
import { LobbyChatService } from '../modules/lobby-chat/lobby-chat.service';
import { User } from '../modules/auth/entities/user.entity';
import { GameService } from '../modules/game/game.service';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({
  cors: {
    origin: env.corsOrigins,
    credentials: true,
  },
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  private readonly socketPlayer = new Map<string, string>();

  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
    private readonly socketAuth: SocketAuthService,
    private readonly reconnect: ReconnectService,
    private readonly lobbyChat: LobbyChatService,
    private readonly gameService: GameService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  afterInit() {
    this.roomService.bindRoomChanged((room) => {
      void this.broadcastGameState(room);
    });
    this.socketAuth.bindNicknameChanged((userId, nickname) => {
      const room = this.roomService.updateNicknameByUser(userId, nickname);
      if (room) void this.broadcastGameState(room);
    });
    this.socketAuth.bindServer(this.server as unknown as Server);
    // BE-11：sandbox 门控 —— SANDBOX_ENABLED=false 时拦所有 sandbox:* 事件
    (this.server as unknown as Server).use((socket, next) => {
      socket.use((packet: any, nextEvent) => {
        const eventName = Array.isArray(packet) ? String(packet[0] ?? '') : '';
        if (!env.sandboxEnabled && eventName.startsWith('sandbox:')) {
          (socket as any).emit('room:error', {
            code: 'E_SANDBOX_DISABLED',
            message: '测试房未启用',
          });
          // blocking-3 修复：若客户端使用 emit(event, payload, ack)，主动调 ack 避免悬挂
          const maybeAck = Array.isArray(packet) ? packet[packet.length - 1] : undefined;
          if (typeof maybeAck === 'function') {
            try {
              maybeAck({ ok: false, error: '测试房未启用', code: 'E_SANDBOX_DISABLED' });
            } catch {
              // ack 回调异常不影响流程
            }
          }
          return; // 不 next → handler 不会被调
        }
        nextEvent();
      });
      next();
    });
  }

  async handleConnection(client: GameSocket) {
    const playerId = uuidv4();
    this.socketPlayer.set(client.id, playerId);
    client.data.playerId = playerId;

    // 认证（无 tk_at 或无效 → 匿名连接）
    const auth = await this.socketAuth.authenticate(client as unknown as Socket);

    // BE-8：若命中 pending reclaim，认领之前的座位
    if (auth.userId) {
      const cancelled = this.reconnect.cancelReclaim(auth.userId);
      const alreadyBound = this.roomService.getPlayerIdByUser(auth.userId);
      if (cancelled) {
        const oldPlayerId = alreadyBound;
        if (oldPlayerId) {
          const room = this.roomService.rebindUserPlayer(auth.userId, oldPlayerId, playerId);
          if (room) {
            void client.join(room.id);
            const filtered = this.roomService.getFilteredRoomForPlayer(room.id, playerId) ?? room;
            client.emit('room:state', filtered);
          }
        }
      }
      // blocking-2 修复：只在"新建绑定"或"刚 rebind 过（映射已经指到新 playerId）"时才 bind
      // 若 alreadyBound && !cancelled：说明该账号已有另一 tab 在线且不是断线重连
      //   保留老映射，不覆盖，避免同账号双 tab 互踢
      if (!alreadyBound || cancelled) {
        this.roomService.bindUserPlayer(auth.userId, playerId);
      }
    }

    // 首帧 auth:hello —— 延后一拍，等客户端挂上 listener
    setImmediate(() => {
      if (client.connected) {
        const boundPlayerId = auth.userId
          ? this.roomService.getPlayerIdByUser(auth.userId) ?? playerId
          : playerId;
        (client as any).emit('auth:hello', {
          userId: auth.userId,
          nickname: auth.nickname,
          preferredVersion: auth.preferredVersion,
          playerId: boundPlayerId,
          _v: 1,
        });
      }
    });
  }

  handleDisconnect(client: GameSocket) {
    const playerId = this.getPlayerId(client);
    const userId = (client.data as any).userId as string | undefined;
    const forceEvict = (client.data as any).forceEvict === true;

    if (userId && !forceEvict) {
      // BE-8：已认证 socket 断线 → 5min 保坐
      const inRoom = !!this.roomService.getPlayerIdByUser(userId);
      if (inRoom) {
        this.reconnect.scheduleReclaim(userId);
        const roomState = this.roomService.markPlayerDisconnected(playerId);
        if (roomState) this.broadcastRoomLifecycle(roomState);
      }
      this.socketPlayer.delete(client.id);
      this.socketAuth.onDisconnect(client as unknown as Socket);
      return;
    }

    // 匿名 or forceEvict → 立即离房
    try {
      const { room, removed, previousRoomId } = this.roomService.leaveRoom(playerId, 'disconnect');
      if (room) {
        client.to(room.id).emit('room:playerLeft', { playerId });
        this.broadcastRoomLifecycle(room);
      } else if (previousRoomId) {
        this.server.to(previousRoomId).emit('room:playerLeft', { playerId });
      }
      if (room && removed) {
        this.chatService.clearRoom(room.id);
      }
    } catch {
      // player was not in a room
    }
    if (userId && forceEvict) {
      // 立即清 userId 索引，避免残留
      this.roomService.unbindUserPlayer(userId);
    }
    this.socketPlayer.delete(client.id);
    this.socketAuth.onDisconnect(client as unknown as Socket);
  }

  @SubscribeMessage('room:create')
  handleCreate(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { nickname: string; versionId?: string },
    ack?: (res: RoomCreateAck) => void,
  ) {
    const playerId = this.getPlayerId(client);
    const userId = (client.data as any).userId as string | undefined;
    try {
      const room = this.roomService.createRoom(
        playerId,
        payload?.nickname ?? '',
        payload?.versionId,
        userId,
      );
      void client.join(room.id);
      client.emit('room:created', room);
      ack?.({ ok: true, room, playerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建失败';
      const code = err instanceof RoomError ? err.code : undefined;
      ack?.({ ok: false, error: message, code });
    }
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { code: string; nickname: string },
    ack?: (res: RoomJoinAck) => void,
  ) {
    const playerId = this.getPlayerId(client);
    const userId = (client.data as any).userId as string | undefined;
    try {
      const room = this.roomService.joinRoom(
        payload.code?.trim() ?? '',
        playerId,
        payload?.nickname ?? '',
        userId,
      );
      void client.join(room.id);
      await this.broadcastGameState(room);
      const filtered = this.roomService.getFilteredRoomForPlayer(room.id, playerId) ?? room;
      client.emit('room:joined', filtered);
      ack?.({ ok: true, room: filtered, playerId });
    } catch (err) {
      const message = err instanceof RoomError ? err.message : '加入失败';
      const code = err instanceof RoomError ? err.code : undefined;
      ack?.({ ok: false, error: message, code });
    }
  }

  @SubscribeMessage('room:leave')
  async handleLeave(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload?: { code?: string; reason?: RoomLeaveReason },
  ) {
    const playerId = this.getPlayerId(client);
    const reason = payload?.reason ?? 'manual';
    try {
      const before = this.roomService.getRoomOfPlayer(playerId);
      if (payload?.code && before && before.code !== payload.code) {
        throw new RoomError('E_ROOM_NOT_FOUND', '房间不匹配');
      }
      const statusBefore = before?.status;
      const { room, previousRoomId, penalty } = this.roomService.leaveRoom(playerId, reason);
      const charged =
        reason === 'manual' &&
        (statusBefore === 'selecting' || statusBefore === 'playing') &&
        (penalty ?? 0) > 0;
      if (charged) {
        await this.chargeManualLeavePenalty(client, penalty ?? 0);
      }
      if (room) {
        void client.leave(room.id);
        client.to(room.id).emit('room:playerLeft', { playerId });
        this.broadcastRoomLifecycle(room);
      } else if (previousRoomId) {
        void client.leave(previousRoomId);
        this.server.to(previousRoomId).emit('room:playerLeft', { playerId });
      }
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('room:ready')
  handleReady(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { ready: boolean },
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.setReady(playerId, !!payload?.ready);
      this.broadcastRoomState(room.id);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('room:start')
  async handleStart(@ConnectedSocket() client: GameSocket) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.startGame(playerId);
      await this.broadcastGameState(room);
      this.server.to(room.id).emit('game:started', { roomId: room.id });
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('general:select')
  async handleGeneralSelect(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { roomCode: string; generalId: string },
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.selectGeneral(
        playerId,
        payload?.roomCode ?? '',
        payload?.generalId ?? '',
      );
      await this.broadcastGameState(room);
      if (room.status === 'playing') {
        this.server.to(room.id).emit('game:started', { roomId: room.id });
      }
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:addPlayer')
  handleSandboxAdd(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { nickname: string; general?: string },
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.sandboxAddVirtualPlayer(
        playerId,
        payload?.nickname ?? '',
        payload?.general,
      );
      this.broadcastRoomState(room.id);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:removePlayer')
  handleSandboxRemove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { playerId: string },
  ) {
    const hostId = this.getPlayerId(client);
    try {
      const room = this.roomService.sandboxRemovePlayer(
        hostId,
        payload?.playerId ?? '',
      );
      this.broadcastRoomState(room.id);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:switchActor')
  handleSandboxSwitch(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { playerId: string },
  ) {
    const socketId = this.getPlayerId(client);
    try {
      const room = this.roomService.setActingPlayer(
        socketId,
        payload?.playerId ?? '',
      );
      client.emit('room:state', room);
      client.emit('sandbox:actor', {
        actingPlayerId: this.roomService.getActingPlayerId(socketId),
      });
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:start')
  async handleSandboxStart(@ConnectedSocket() client: GameSocket) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.sandboxStart(playerId);
      await this.broadcastGameState(room);
      this.server.to(room.id).emit('game:started', { roomId: room.id });
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:playCard')
  handleSandboxPlay(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { card: string; handIndex?: number },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxPlayCard(
        socketId,
        actingId,
        payload?.card ?? '',
        payload?.handIndex,
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:confirmPlay')
  async handleSandboxConfirm(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = await this.roomService.sandboxConfirmPlay(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:selectTargets')
  async handleSandboxTargets(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; targetIds: string[]; zoneCardId?: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = await this.roomService.sandboxSelectTargets(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.targetIds ?? [],
        payload?.zoneCardId,
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:submitResponse')
  async handleSandboxResponse(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = await this.roomService.sandboxSubmitResponse(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:useSkill')
  handleSandboxSkill(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { skillId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxUseSkill(
        socketId,
        actingId,
        payload?.skillId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:rendeGive')
  handleSandboxRende(
    @ConnectedSocket() client: GameSocket,
    @MessageBody()
    payload: { targetId: string; cards: string[]; handIndices?: number[] },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxRendeGive(
        socketId,
        actingId,
        payload?.targetId ?? '',
        payload?.cards ?? [],
        payload?.handIndices,
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:rendeFinish')
  handleSandboxRendeFinish(@ConnectedSocket() client: GameSocket) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxRendeFinish(socketId, actingId);
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:qingnangRecover')
  handleSandboxQingnangRecover(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { targetId: string; handIndex?: number; handIndices?: number[] },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxQingnangRecover(
        socketId,
        actingId,
        payload?.targetId ?? '',
        payload?.handIndices ?? payload?.handIndex ?? -1,
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:zhihengConfirm')
  handleSandboxZhiheng(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { handIndices: number[] },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxZhihengConfirm(
        socketId,
        actingId,
        payload?.handIndices ?? [],
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:modifyJudge')
  handleSandboxModifyJudge(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; handIndex: number },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxModifyJudge(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.handIndex ?? -1,
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:skipModifyJudge')
  handleSandboxSkipModifyJudge(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxSkipModifyJudge(
        socketId,
        actingId,
        payload?.promptId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:discardCards')
  handleSandboxDiscard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; handIndices: number[] },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxDiscardCards(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.handIndices ?? [],
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:cancelDiscard')
  handleSandboxCancelDiscard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxCancelDiscard(
        socketId,
        actingId,
        payload?.promptId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:selectZoneCard')
  async handleSandboxSelectZoneCard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = await this.roomService.sandboxSelectZoneCard(
        socketId,
        actingId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      );
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:addCard')
  handleSandboxAddCard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { playerId: string; card: string },
  ) {
    const hostId = this.getPlayerId(client);
    try {
      const room = this.roomService.sandboxAddCard(
        hostId,
        payload?.playerId ?? '',
        payload?.card ?? '',
      );
      this.broadcastRoomState(room.id);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('sandbox:endTurn')
  async handleSandboxEndTurn(@ConnectedSocket() client: GameSocket) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxEndTurn(socketId, actingId);
      await this.broadcastGameState(room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  // ==== 正式房间对局 Gateway 事件 ====

  @SubscribeMessage('game:playCard')
  async handleGamePlay(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { card: string; handIndex?: number },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gamePlayCard(playerId, payload?.card ?? '', payload?.handIndex),
    );
  }

  @SubscribeMessage('game:confirmPlay')
  async handleGameConfirm(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameConfirmPlay(
        playerId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      ),
    );
  }

  @SubscribeMessage('game:selectTargets')
  async handleGameTargets(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; targetIds: string[]; zoneCardId?: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameSelectTargets(
        playerId,
        payload?.promptId ?? '',
        payload?.targetIds ?? [],
        payload?.zoneCardId,
      ),
    );
  }

  @SubscribeMessage('game:submitResponse')
  async handleGameResponse(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameSubmitResponse(
        playerId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      ),
    );
  }

  @SubscribeMessage('game:useSkill')
  async handleGameSkill(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { skillId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameUseSkill(playerId, payload?.skillId ?? ''),
    );
  }

  @SubscribeMessage('game:rendeGive')
  async handleGameRende(
    @ConnectedSocket() client: GameSocket,
    @MessageBody()
    payload: { targetId: string; cards: string[]; handIndices?: number[] },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameRendeGive(
        playerId,
        payload?.targetId ?? '',
        payload?.cards ?? [],
        payload?.handIndices,
      ),
    );
  }

  @SubscribeMessage('game:rendeFinish')
  async handleGameRendeFinish(@ConnectedSocket() client: GameSocket) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameRendeFinish(playerId),
    );
  }

  @SubscribeMessage('game:qingnangRecover')
  async handleGameQingnangRecover(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { targetId: string; handIndex?: number; handIndices?: number[] },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameQingnangRecover(
        playerId,
        payload?.targetId ?? '',
        payload?.handIndices ?? payload?.handIndex ?? -1,
      ),
    );
  }

  @SubscribeMessage('game:zhihengConfirm')
  async handleGameZhiheng(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { handIndices: number[] },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameZhihengConfirm(playerId, payload?.handIndices ?? []),
    );
  }

  @SubscribeMessage('game:modifyJudge')
  async handleGameModifyJudge(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; handIndex: number },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameModifyJudge(
        playerId,
        payload?.promptId ?? '',
        payload?.handIndex ?? -1,
      ),
    );
  }

  @SubscribeMessage('game:skipModifyJudge')
  async handleGameSkipModifyJudge(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameSkipModifyJudge(playerId, payload?.promptId ?? ''),
    );
  }

  @SubscribeMessage('game:discardCards')
  async handleGameDiscard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; handIndices: number[] },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameDiscardCards(
        playerId,
        payload?.promptId ?? '',
        payload?.handIndices ?? [],
      ),
    );
  }

  @SubscribeMessage('game:cancelDiscard')
  async handleGameCancelDiscard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameCancelDiscard(playerId, payload?.promptId ?? ''),
    );
  }

  @SubscribeMessage('game:selectZoneCard')
  async handleGameSelectZoneCard(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { promptId: string; choiceId: string },
  ) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameSelectZoneCard(
        playerId,
        payload?.promptId ?? '',
        payload?.choiceId ?? '',
      ),
    );
  }

  @SubscribeMessage('game:endTurn')
  async handleGameEndTurn(@ConnectedSocket() client: GameSocket) {
    await this.dispatchFormalGame(client, (playerId) =>
      this.roomService.gameEndTurn(playerId),
    );
  }

  @SubscribeMessage('game:sync')
  async handleGameSync(
    @ConnectedSocket() client: GameSocket,
    ack?: (room: import('@tk/shared').Room | null) => void,
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.getRoomByPlayerId(playerId);
      if (room.status !== 'playing' && room.status !== 'finished') {
        ack?.(room);
        return;
      }
      const filtered = this.roomService.getFilteredRoomForPlayer(room.id, playerId);
      ack?.(filtered);
      if (filtered) client.emit('room:state', filtered);
    } catch {
      ack?.(null);
    }
  }

  @SubscribeMessage('chat:send')
  handleChat(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { content: string },
  ) {
    // BE-10：匿名不允许发言
    const userId = (client.data as any).userId as string | undefined;
    if (!userId) {
      (client as any).emit('chat:error', {
        code: 'E_UNAUTHORIZED',
        message: '请先登录',
        scope: 'room',
        _v: 1,
      });
      return;
    }
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.getRoomByPlayerId(playerId);
      const player = room.players.find((p) => p.id === playerId);
      const message = this.chatService.send(
        room.id,
        playerId,
        player?.nickname ?? '玩家',
        payload?.content ?? '',
      );
      this.server.to(room.id).emit('chat:message', { ...message, _v: 1 } as any);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('chat:history')
  handleChatHistory(
    @ConnectedSocket() client: GameSocket,
    ack?: (messages: import('@tk/shared').ChatMessage[]) => void,
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.getRoomByPlayerId(playerId);
      ack?.(this.chatService.getHistory(room.id));
    } catch {
      ack?.([]);
    }
  }

  // ==== BE-8 · 房间列表（契约 §6.1） ====

  @SubscribeMessage('room:list')
  handleRoomList(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { versionId?: string },
  ): ReturnType<RoomService['listPublicRooms']> {
    const playerId = this.getPlayerId(client);
    const userId = (client.data as any).userId as string | undefined;
    return this.roomService.listPublicRooms(payload?.versionId, playerId, userId);
  }

  // ==== BE-9 · 大厅聊天 ====

  @SubscribeMessage('lobby:chat:send')
  async handleLobbyChatSend(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { content: string },
  ) {
    const userId = (client.data as any).userId as string | undefined;
    const nickname = ((client.data as any).nickname as string | undefined) ?? '玩家';
    if (!userId) {
      (client as any).emit('chat:error', {
        code: 'E_CHAT_MUTED',
        message: '请先登录后发送',
        scope: 'lobby',
        _v: 1,
      });
      return;
    }
    const result = await this.lobbyChat.send(userId, nickname, payload?.content ?? '');
    if (!result.ok) {
      (client as any).emit('chat:error', {
        code: result.code,
        message: result.message,
        scope: 'lobby',
        _v: 1,
      });
      return;
    }
    // 广播全体（含匿名订阅者）
    this.server.emit('lobby:chat:message' as any, result.message);
  }

  @SubscribeMessage('lobby:chat:snapshot')
  async handleLobbyChatSnapshot(): Promise<unknown[]> {
    // Nest 里 return 会自动作为 ack payload 返回给客户端
    return this.lobbyChat.snapshot();
  }

  // ==== BE-13 · 版本切换 ====

  @SubscribeMessage('version:switch')
  async handleVersionSwitch(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { versionId: string },
  ) {
    const userId = (client.data as any).userId as string | undefined;
    if (!userId) {
      (client as any).emit('room:error', {
        code: 'E_UNAUTHORIZED',
        message: '请先登录',
      });
      return;
    }
    const version = findVersion(payload?.versionId ?? '');
    if (!version) {
      (client as any).emit('room:error', {
        code: 'E_VERSION_UNKNOWN',
        message: '未知版本',
      });
      return;
    }
    await this.userRepo.update({ id: userId }, { preferredVersion: version.id });
    // 广播到该 userId 的所有 socket（包括自己）
    this.socketAuth.emitToUser(userId, 'version:switched', {
      versionId: version.id,
      _v: 1,
    });
  }

  private async dispatchFormalGame(
    client: GameSocket,
    action: (playerId: string) => Room | Promise<Room>,
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = await action(playerId);
      await this.broadcastGameState(room);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  private async broadcastGameState(room: import('@tk/shared').Room) {
    if (room.isSandbox) {
      this.server.to(room.id).emit('room:state', room);
      return;
    }
    if (room.status === 'selecting' || room.status === 'playing' || room.status === 'finished') {
      const sockets = await this.server.in(room.id).fetchSockets();
      for (const socket of sockets) {
        const playerId =
          (socket.data as { playerId?: string }).playerId ??
          this.socketPlayer.get(socket.id);
        if (!playerId) continue;
        const filtered = this.roomService.getFilteredRoomForPlayer(room.id, playerId);
        if (!filtered) continue;
        socket.emit('room:state', filtered);
      }
      if (room.sandbox?.victory) {
        this.server.to(room.id).emit('game:finished', {
          roomId: room.id,
          victory: room.sandbox.victory,
        });
        this.server.to(room.id).emit('game:event', {
          type: 'victory',
          message: room.sandbox.victory.message,
        });
      }
      if (room.status === 'finished') {
        const recovered = this.roomService.completeFinishedRoom(room.id);
        if (recovered) {
          const refreshedSockets = await this.server.in(room.id).fetchSockets();
          for (const socket of refreshedSockets) {
            const playerId =
              (socket.data as { playerId?: string }).playerId ??
              this.socketPlayer.get(socket.id);
            if (!playerId) continue;
            const filtered = this.roomService.getFilteredRoomForPlayer(room.id, playerId);
            if (!filtered) continue;
            socket.emit('room:state', filtered);
          }
        }
      }
      return;
    }
    this.server.to(room.id).emit('room:state', room);
  }

  private broadcastRoomState(roomId: string) {
    const room = this.roomService.getRoomById(roomId);
    if (room) {
      void this.broadcastGameState(room);
    }
  }

  private broadcastRoomLifecycle(room: Room) {
    if (room.roomLifecycle) {
      this.server.to(room.id).emit('room.lifecycle.state_changed', {
        roomId: room.id,
        lifecycle: room.roomLifecycle,
        hostId: room.hostId,
        _v: 1,
      });
    }
    void this.broadcastGameState(room);
  }

  private async chargeManualLeavePenalty(client: GameSocket, amount: number): Promise<void> {
    const userId = (client.data as any).userId as string | undefined;
    if (!userId || amount <= 0) return;
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ coins: () => `MAX(coins - ${amount}, 0)` })
      .where('id = :userId', { userId })
      .execute();
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      this.socketAuth.emitToUser(userId, 'user:walletChanged', {
        coins: user.coins,
        experience: user.experience,
        level: user.level,
        reason: 'manual-leave',
        _v: 1,
      });
    }
  }

  private getPlayerId(client: GameSocket): string {
    return (
      (client.data.playerId as string) ??
      this.socketPlayer.get(client.id) ??
      client.id
    );
  }

  private getActingPlayerId(client: GameSocket): string {
    const socketId = this.getPlayerId(client);
    return this.roomService.getActingPlayerId(socketId);
  }

  private emitError(client: GameSocket, err: unknown) {
    const code = err instanceof RoomError || err instanceof ChatError
      ? err.code
      : 'UNKNOWN';
    const message = err instanceof Error ? err.message : '未知错误';
    client.emit('room:error', { code, message });
  }
}
