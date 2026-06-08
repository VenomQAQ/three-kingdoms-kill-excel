import { Injectable, OnModuleInit } from '@nestjs/common';
import { SangokushiEngine } from '@tk/engine';
import { v4 as uuidv4 } from 'uuid';
import {
  MAX_ROOM_PLAYERS,
  Room,
  RoomListItem,
  RoomPlayer,
  SANDBOX_ROOM_CODE,
  SandboxGameState,
} from '@tk/shared';
import { GameService } from '../game/game.service';

const CODE_MIN = 10_000_000;
const CODE_MAX = 99_999_999;
const MAX_CODE_RETRIES = 10;

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly roomsById = new Map<string, Room>();
  private readonly roomIdByCode = new Map<string, string>();
  private readonly playerRoom = new Map<string, string>();

  constructor(private readonly gameService: GameService) {}

  onModuleInit() {
    this.ensureSandboxRoom();
  }

  createRoom(hostId: string, nickname: string): Room {
    const code = this.generateUniqueCode();
    const room: Room = {
      id: uuidv4(),
      code,
      hostId,
      maxPlayers: MAX_ROOM_PLAYERS,
      players: [
        {
          id: hostId,
          nickname: nickname.trim() || '玩家',
          ready: false,
          connected: true,
        },
      ],
      status: 'waiting',
      settings: { maxPlayers: MAX_ROOM_PLAYERS },
      createdAt: Date.now(),
    };
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(code, room.id);
    this.playerRoom.set(hostId, room.id);
    return room;
  }

  joinRoom(code: string, playerId: string, nickname: string): Room {
    if (code === SANDBOX_ROOM_CODE) {
      return this.joinSandboxRoom(playerId, nickname);
    }
    const room = this.getRoomByCode(code);
    if (!room) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在');
    }
    if (room.status !== 'waiting') {
      throw new RoomError('ROOM_PLAYING', '对局已开始，无法加入');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', '房间已满');
    }
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname.trim() || existing.nickname;
      return room;
    }
    const rejoin = room.players.find(
      (p) => p.nickname === nickname.trim() && !p.connected,
    );
    if (rejoin) {
      rejoin.id = playerId;
      rejoin.connected = true;
      this.playerRoom.set(playerId, room.id);
      return room;
    }
    room.players.push({
      id: playerId,
      nickname: nickname.trim() || '玩家',
      ready: false,
      connected: true,
    });
    this.playerRoom.set(playerId, room.id);
    return room;
  }

  leaveRoom(playerId: string): { room: Room | null; removed: boolean } {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return { room: null, removed: false };
    const room = this.roomsById.get(roomId);
    if (!room) {
      this.playerRoom.delete(playerId);
      return { room: null, removed: false };
    }
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return { room, removed: false };

    if (room.status === 'waiting') {
      room.players.splice(idx, 1);
      this.playerRoom.delete(playerId);
      if (room.players.length === 0) {
        this.deleteRoom(room);
        return { room: null, removed: true };
      }
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id;
      }
      return { room, removed: true };
    }

    room.players[idx].connected = false;
    return { room, removed: false };
  }

  setReady(playerId: string, ready: boolean): Room {
    const room = this.getRoomByPlayerId(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('NOT_IN_ROOM', '不在房间内');
    player.ready = ready;
    return room;
  }

  startGame(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxStart(playerId);
    }
    if (room.hostId !== playerId) {
      throw new RoomError('NOT_HOST', '仅房主可开始游戏');
    }
    if (room.status !== 'waiting') {
      throw new RoomError('ALREADY_STARTED', '对局已开始');
    }
    if (room.players.length < 2) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', '至少需要 2 名玩家');
    }
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) {
      throw new RoomError('NOT_ALL_READY', '还有玩家未准备');
    }
    room.status = 'playing';
    room.players.forEach((p, i) => {
      p.seat = i + 1;
    });
    return room;
  }

  ensureSandboxRoom(): Room {
    const existing = this.getRoomByCode(SANDBOX_ROOM_CODE);
    if (existing) return existing;
    const room: Room = {
      id: uuidv4(),
      code: SANDBOX_ROOM_CODE,
      hostId: '',
      maxPlayers: MAX_ROOM_PLAYERS,
      players: [],
      status: 'waiting',
      settings: { maxPlayers: MAX_ROOM_PLAYERS },
      createdAt: Date.now(),
      isSandbox: true,
      sandbox: { phase: 'lobby', turnIndex: 0, round: 1, log: [] },
    };
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(room.code, room.id);
    return room;
  }

  joinSandboxRoom(playerId: string, nickname: string): Room {
    const room = this.ensureSandboxRoom();
    const trimmedNick = nickname.trim() || '玩家';

    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = trimmedNick || existing.nickname;
      this.playerRoom.set(playerId, room.id);
      this.actingPlayerBySocket.set(playerId, playerId);
      return room;
    }

    const rejoin = room.players.find(
      (p) => !p.isVirtual && p.nickname === trimmedNick && !p.connected,
    );
    if (rejoin) {
      const oldId = rejoin.id;
      rejoin.id = playerId;
      rejoin.connected = true;
      this.playerRoom.delete(oldId);
      this.playerRoom.set(playerId, room.id);
      if (room.hostId === oldId) room.hostId = playerId;
      this.actingPlayerBySocket.set(playerId, playerId);
      if (room.status === 'playing') {
        this.gameService.remapSandboxPlayerId(room.id, oldId, playerId);
        const engine = this.gameService.getSandboxEngine(room.id);
        if (engine) this.gameService.syncRoomFromEngine(room, engine);
      }
      return room;
    }

    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', '房间已满');
    }
    const hasRealHost = room.players.some((p) => p.id === room.hostId && !p.isVirtual);
    if (!hasRealHost) room.hostId = playerId;
    room.players.push({
      id: playerId,
      nickname: trimmedNick || `测试员${room.players.length + 1}`,
      ready: true,
      connected: true,
      handCards: [],
    });
    this.playerRoom.set(playerId, room.id);
    this.actingPlayerBySocket.set(playerId, playerId);
    return room;
  }

  sandboxAddVirtualPlayer(
    hostPlayerId: string,
    nickname: string,
    general?: string,
  ): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) {
      throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    }
    if (room.hostId !== hostPlayerId) {
      throw new RoomError('NOT_HOST', '仅房主可添加角色');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', '房间已满');
    }
    const name = nickname.trim() || `角色${room.players.length + 1}`;
    room.players.push({
      id: uuidv4(),
      nickname: name,
      general: general?.trim() || name,
      ready: true,
      connected: true,
      isVirtual: true,
      handCards: ['杀', '闪', '桃'],
    });
    return room;
  }

  sandboxRemovePlayer(hostPlayerId: string, targetId: string): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    if (room.hostId !== hostPlayerId) {
      throw new RoomError('NOT_HOST', '仅房主可移除角色');
    }
    const target = room.players.find((p) => p.id === targetId);
    if (!target?.isVirtual) {
      throw new RoomError('INVALID_TARGET', '只能移除虚拟角色');
    }
    room.players = room.players.filter((p) => p.id !== targetId);
    if (room.sandbox && room.sandbox.turnIndex >= room.players.length) {
      room.sandbox.turnIndex = 0;
    }
    return room;
  }

  private readonly actingPlayerBySocket = new Map<string, string>();

  resolveActingPlayerId(socketPlayerId: string): string {
    return this.actingPlayerBySocket.get(socketPlayerId) ?? socketPlayerId;
  }

  setActingPlayer(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    const target = room.players.find((p) => p.id === actingPlayerId);
    if (!target) throw new RoomError('PLAYER_NOT_FOUND', '角色不存在');
    this.actingPlayerBySocket.set(socketPlayerId, actingPlayerId);
    return room;
  }

  sandboxStart(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    if (room.hostId !== playerId) {
      throw new RoomError('NOT_HOST', '仅房主可开局');
    }
    const realHost = room.players.find((p) => p.id === room.hostId && !p.isVirtual);
    if (!realHost) {
      throw new RoomError('NOT_HOST', '虚拟角色不能作为房主开局');
    }
    if (room.players.length < 1) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', '请至少添加 1 名角色');
    }
    room.status = 'playing';
    const sampleGenerals = [
      '界刘备',
      '界关羽',
      '界赵云',
      '界曹操',
      '界司马懿',
      '孙权',
      '界周瑜',
      '界吕布',
    ];
    const sampleEquip = [
      ['的卢', '诸葛连弩'],
      ['仁王盾'],
      [],
      ['青龙偃月刀'],
      [],
    ];
    let lordAssigned = false;
    room.players.forEach((p, i) => {
      p.seat = i + 1;
      p.role = undefined;
      if (!lordAssigned && !p.isVirtual) {
        p.role = '主公';
        lordAssigned = true;
      } else {
        p.role = '反贼';
      }
      p.maxHp = 4;
      p.hp = p.role === '主公' ? 5 : 4;
      p.equipment = sampleEquip[i % sampleEquip.length] ?? [];
      p.judgeCards = i === 2 ? ['乐不思蜀'] : [];
      if (!p.handCards?.length) {
        p.handCards = ['杀', '闪', '桃', '酒', '过河拆桥'];
      }
      if (!p.general) {
        p.general = sampleGenerals[i % sampleGenerals.length] ?? p.nickname;
      }
    });
    const lordIndex = SangokushiEngine.findLordIndex(room.players);
    const lord = room.players[lordIndex]!;
    room.sandbox = {
      phase: 'playing',
      turnIndex: lordIndex,
      round: 1,
      turnPhase: 'judge',
      log: [],
      prompt: null,
    };

    const engine = this.gameService.createSandboxEngine(room);
    engine.start();
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  private requireSandboxEngine(room: Room): SangokushiEngine {
    const engine = this.gameService.getSandboxEngine(room.id);
    if (!engine) {
      throw new RoomError('ENGINE_MISSING', '对局引擎未初始化');
    }
    return engine;
  }

  sandboxPlayCard(
    socketPlayerId: string,
    actingPlayerId: string,
    card: string,
    handIndex?: number,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');

    const engine = this.requireSandboxEngine(room);
    const res = engine.initiatePlayCard(actingPlayerId, trimmed, handIndex);
    if (!res.ok) throw new RoomError('PLAY_FAILED', res.error ?? '无法出牌');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxConfirmPlay(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing') {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitPromptChoice(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSelectTargets(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    targetIds: string[],
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.selectTargets(actingPlayerId, promptId, targetIds);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选目标失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSubmitResponse(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitResponse(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '响应失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxUseSkill(
    socketPlayerId: string,
    actingPlayerId: string,
    skillId: string,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.initiateSkill(actingPlayerId, skillId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '技能失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxRendeGive(
    socketPlayerId: string,
    actingPlayerId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.rendeGive(
      actingPlayerId,
      targetId,
      cards.map((c) => c.trim()).filter(Boolean),
      handIndices,
    );
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '仁德失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxRendeFinish(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.rendeFinish(actingPlayerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束仁德');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxZhihengConfirm(
    socketPlayerId: string,
    actingPlayerId: string,
    handIndices: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.zhihengConfirm(actingPlayerId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '制衡失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxModifyJudge(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    handIndex: number,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.submitModifyJudge(actingPlayerId, promptId, handIndex);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '改判失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxSkipModifyJudge(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.skipModifyJudge(actingPlayerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxDiscardCards(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    handIndices: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.submitDiscard(actingPlayerId, promptId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxSelectZoneCard(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.submitZoneCard(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxAddCard(
    hostPlayerId: string,
    targetId: string,
    card: string,
  ): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw new RoomError('PLAYER_NOT_FOUND', '角色不存在');
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');
    if (!target.handCards) target.handCards = [];
    target.handCards.push(trimmed);
    return room;
  }

  sandboxEndTurn(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const engine = this.requireSandboxEngine(room);
    const res = engine.endTurn(actingPlayerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束回合');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  listPublicRooms(): RoomListItem[] {
    this.ensureSandboxRoom();
    return [...this.roomsById.values()]
      .filter((r) => r.players.length > 0 || r.isSandbox)
      .map((r) => ({
        code: r.code,
        status: r.status,
        playerCount: r.players.length,
        maxPlayers: r.maxPlayers,
        hostNickname:
          r.players.find((p) => p.id === r.hostId)?.nickname ?? '—',
        isSandbox: r.isSandbox,
      }))
      .sort((a, b) => {
        if (a.isSandbox) return -1;
        if (b.isSandbox) return 1;
        return a.code.localeCompare(b.code);
      });
  }

  getRoomByPlayerId(playerId: string): Room {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) throw new RoomError('NOT_IN_ROOM', '不在房间内');
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', '房间不存在');
    return room;
  }

  getRoomByCode(code: string): Room | null {
    const roomId = this.roomIdByCode.get(code);
    if (!roomId) return null;
    return this.roomsById.get(roomId) ?? null;
  }

  getRoomById(id: string): Room | null {
    return this.roomsById.get(id) ?? null;
  }

  listWaitingRooms(): Room[] {
    return [...this.roomsById.values()].filter((r) => r.status === 'waiting');
  }

  getActingPlayerId(socketPlayerId: string): string {
    return this.resolveActingPlayerId(socketPlayerId);
  }

  private generateUniqueCode(): string {
    for (let i = 0; i < MAX_CODE_RETRIES; i++) {
      const num =
        Math.floor(Math.random() * (CODE_MAX - CODE_MIN + 1)) + CODE_MIN;
      const code = String(num);
      if (!this.roomIdByCode.has(code)) return code;
    }
    throw new RoomError('CODE_GENERATION_FAILED', '无法生成房间号，请重试');
  }

  private deleteRoom(room: Room): void {
    this.gameService.destroyEngine(room.id);
    this.roomsById.delete(room.id);
    this.roomIdByCode.delete(room.code);
    for (const p of room.players) {
      this.playerRoom.delete(p.id);
    }
  }
}

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}
