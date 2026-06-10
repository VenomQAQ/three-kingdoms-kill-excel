import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
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
import { ChatError, ChatService } from '../modules/chat/chat.service';
import { RoomError, RoomService } from '../modules/room/room.service';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  private readonly socketPlayer = new Map<string, string>();

  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
  ) {}

  handleConnection(client: GameSocket) {
    const playerId = uuidv4();
    this.socketPlayer.set(client.id, playerId);
    client.data.playerId = playerId;
  }

  handleDisconnect(client: GameSocket) {
    const playerId = this.getPlayerId(client);
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
    this.socketPlayer.delete(client.id);
  }

  @SubscribeMessage('room:create')
  handleCreate(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { nickname: string },
    ack?: (res: RoomCreateAck) => void,
  ) {
    const playerId = this.getPlayerId(client);
    try {
      const room = this.roomService.createRoom(
        playerId,
        payload?.nickname ?? '',
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
      this.server.to(room.id).emit('chat:message', message);
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
