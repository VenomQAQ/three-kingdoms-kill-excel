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
  RoomCreateAck,
  RoomJoinAck,
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

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
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
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  afterInit() {
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
          return; // 不 next
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
      if (cancelled) {
        const oldPlayerId = this.roomService.getPlayerIdByUser(auth.userId);
        if (oldPlayerId) {
          const room = this.roomService.rebindUserPlayer(auth.userId, oldPlayerId, playerId);
          if (room) {
            void client.join(room.id);
            client.emit('room:state', room);
          }
        }
      }
      this.roomService.bindUserPlayer(auth.userId, playerId);
    }

    // 首帧 auth:hello —— 延后一拍，等客户端挂上 listener
    setImmediate(() => {
      if (client.connected) {
        (client as any).emit('auth:hello', {
          userId: auth.userId,
          nickname: auth.nickname,
          preferredVersion: auth.preferredVersion,
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
        this.roomService.markPlayerDisconnected(playerId);
        const roomState = this.roomService.getRoomOfPlayer(playerId);
        if (roomState) this.broadcastRoomState(roomState.id);
      }
      this.socketPlayer.delete(client.id);
      this.socketAuth.onDisconnect(client as unknown as Socket);
      return;
    }

    // 匿名 or forceEvict → 立即离房
    try {
      const { room, removed } = this.roomService.leaveRoom(playerId);
      if (room) {
        client.to(room.id).emit('room:playerLeft', { playerId });
        this.broadcastRoomState(room.id);
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
    try {
      const room = this.roomService.createRoom(
        playerId,
        payload?.nickname ?? '',
        payload?.versionId,
      );
      void client.join(room.id);
      client.emit('room:created', room);
      ack?.({ ok: true, room, playerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建失败';
      ack?.({ ok: false, error: message });
    }
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { code: string; nickname: string },
    ack?: (res: RoomJoinAck) => void,
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.joinRoom(
        payload.code?.trim() ?? '',
        playerId,
        payload?.nickname ?? '',
      );
      void client.join(room.id);
      client.emit('room:joined', room);
      client.to(room.id).emit('room:state', room);
      ack?.({ ok: true, room, playerId });
    } catch (err) {
      const message =
        err instanceof RoomError ? err.message : '加入失败';
      ack?.({ ok: false, error: message });
    }
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: GameSocket) {
    const playerId = this.getPlayerId(client);
    try {
      const { room } = this.roomService.leaveRoom(playerId);
      if (room) {
        void client.leave(room.id);
        client.to(room.id).emit('room:playerLeft', { playerId });
        this.broadcastRoomState(room.id);
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
    const playerId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.setReady(playerId, !!payload?.ready);
      this.broadcastRoomState(room.id);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('room:start')
  handleStart(@ConnectedSocket() client: GameSocket) {
    const playerId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.startGame(playerId);
      this.server.to(room.id).emit('room:state', room);
      this.server.to(room.id).emit('game:started', { roomId: room.id });
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
  handleSandboxStart(@ConnectedSocket() client: GameSocket) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.sandboxStart(playerId);
      this.server.to(room.id).emit('room:state', room);
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
  handleSandboxEndTurn(@ConnectedSocket() client: GameSocket) {
    const socketId = this.getPlayerId(client);
    const actingId = this.getActingPlayerId(client);
    try {
      const room = this.roomService.sandboxEndTurn(socketId, actingId);
      this.server.to(room.id).emit('room:state', room);
    } catch (err) {
      this.emitError(client, err);
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

  private broadcastRoomState(roomId: string) {
    const room = this.roomService.getRoomById(roomId);
    if (room) {
      this.server.to(roomId).emit('room:state', room);
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
