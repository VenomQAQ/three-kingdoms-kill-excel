import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  assignIdentities,
  CharacterRegistry,
  SangokushiEngine,
} from '@tk/engine';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_VERSION_ID,
  findVersion,
  Room,
  RoomListItem,
  RoomLeaveReason,
  RoomPlayer,
  SANDBOX_ROOM_CODE,
  SandboxGameState,
} from '@tk/shared';
import { env } from '../../config/env';
import { GameService } from '../game/game.service';

const CODE_MIN = 10_000_000;
const CODE_MAX = 99_999_999;
const MAX_CODE_RETRIES = 10;
const LORD_GENERAL_OPTION_COUNT = 5;
const GENERAL_OPTION_COUNT = 3;
const MANUAL_LEAVE_PENALTY = 5;
const DISCONNECT_GRACE_MS = 5 * 60 * 1000;

export interface LeaveRoomResult {
  room: Room | null;
  removed: boolean;
  disbanded: boolean;
  previousRoomId?: string;
  previousHostId?: string;
  newHostId?: string;
  penalty?: number;
}

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly roomsById = new Map<string, Room>();
  private readonly roomIdByCode = new Map<string, string>();
  private readonly playerRoom = new Map<string, string>();
  /** userId → playerId（当前活跃的 socket-scoped id） */
  private readonly userPlayer = new Map<string, string>();
  private readonly selectingTimers = new Map<string, NodeJS.Timeout>();
  private readonly generalOptionsByRoom = new Map<string, Map<string, string[]>>();
  private roomChanged: ((room: Room) => void) | null = null;

  constructor(private readonly gameService: GameService) {}

  onModuleInit() {
    this.ensureSandboxRoom();
  }

  bindRoomChanged(callback: (room: Room) => void): void {
    this.roomChanged = callback;
  }

  /**
   * BE-8：断线保坐用。给 gateway/reconnect.service 调用的最小接口。
   */
  getRoomOfPlayer(playerId: string): Room | null {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return null;
    return this.roomsById.get(roomId) ?? null;
  }
  markPlayerDisconnected(playerId: string): Room | null {
    const room = this.getRoomOfPlayer(playerId);
    if (!room) return null;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = false;

    if (room.hostId === playerId) {
      this.syncLifecycle(room, {
        hostTransferPending: true,
        disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS,
      });
      const nextHostId = this.transferHost(room, playerId);
      if (!nextHostId) {
        this.deleteRoom(room);
        return null;
      }
    }

    this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
    return room;
  }
  bindUserPlayer(userId: string, playerId: string): void {
    this.userPlayer.set(userId, playerId);
  }
  unbindUserPlayer(userId: string): void {
    this.userPlayer.delete(userId);
  }
  getPlayerIdByUser(userId: string): string | null {
    return this.userPlayer.get(userId) ?? null;
  }

  updateNicknameByUser(userId: string, nickname: string): Room | null {
    const playerId = this.userPlayer.get(userId);
    if (!playerId) return null;
    const room = this.getRoomOfPlayer(playerId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return null;
    player.nickname = nickname;
    return room;
  }
  /**
   * 5min 到期或改密强制回收：将 userId 对应的座位真正 leaveRoom。
   */
  evictByUser(userId: string): LeaveRoomResult {
    const playerId = this.userPlayer.get(userId);
    if (!playerId) return { room: null, removed: false, disbanded: false };
    this.userPlayer.delete(userId);
    return this.leaveRoom(playerId, 'evict');
  }
  /**
   * 重连时把老 playerId 的座位迁移到新 playerId 上。
   * 若老 playerId 已不在房间（可能已被 evict），返回 null 让上层走"重新加入"。
   */
  rebindUserPlayer(userId: string, oldPlayerId: string, newPlayerId: string): Room | null {
    if (oldPlayerId === newPlayerId) {
      this.userPlayer.set(userId, newPlayerId);
      return this.roomsById.get(this.playerRoom.get(newPlayerId) ?? '') ?? null;
    }
    const roomId = this.playerRoom.get(oldPlayerId);
    if (!roomId) return null;
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === oldPlayerId);
    if (!player) return null;
    player.id = newPlayerId;
    player.connected = true;
    this.playerRoom.delete(oldPlayerId);
    this.playerRoom.set(newPlayerId, roomId);
    if (room.hostId === oldPlayerId) room.hostId = newPlayerId;
    this.userPlayer.set(userId, newPlayerId);
    // sandbox 引擎里的 playerId 也要迁移
    if (room.isSandbox && room.status === 'playing') {
      this.gameService.remapPlayerId(room.id, oldPlayerId, newPlayerId);
      const engine = this.gameService.getRoomEngine(room.id);
      if (engine) this.gameService.syncRoomFromEngine(room, engine);
    } else if (!room.isSandbox && room.status === 'playing') {
      this.gameService.remapPlayerId(room.id, oldPlayerId, newPlayerId);
      const engine = this.gameService.getRoomEngine(room.id);
      if (engine) this.gameService.syncRoomFromEngine(room, engine);
    } else if (!room.isSandbox && room.status === 'selecting') {
      this.remapSelectingPlayer(room, oldPlayerId, newPlayerId);
    }
    return room;
  }

  createRoom(hostId: string, nickname: string, versionId: string = DEFAULT_VERSION_ID): Room {
    const version = findVersion(versionId);
    if (!version) {
      throw new RoomError('E_VERSION_UNKNOWN', `未知版本 ${versionId}`);
    }
    const maxPlayers = version.maxPlayers;
    const code = this.generateUniqueCode();
    const room: Room = {
      id: uuidv4(),
      code,
      hostId,
      maxPlayers,
      versionId: version.id,
      versionName: version.name,
      players: [
        {
          id: hostId,
          nickname: nickname.trim() || '玩家',
          ready: false,
          connected: true,
        },
      ],
      status: 'waiting',
      settings: { maxPlayers },
      createdAt: Date.now(),
    };
    this.syncLifecycle(room);
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(code, room.id);
    this.playerRoom.set(hostId, room.id);
    this.actingPlayerBySocket.set(hostId, hostId);
    return room;
  }

  joinRoom(code: string, playerId: string, nickname: string, userId?: string | null): Room {
    if (code === SANDBOX_ROOM_CODE) {
      return this.joinSandboxRoom(playerId, nickname, userId);
    }
    const room = this.getRoomByCode(code);
    if (!room) {
      throw new RoomError('E_ROOM_NOT_FOUND', '房间不存在');
    }
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname.trim() || existing.nickname;
      this.syncLifecycle(room);
      this.actingPlayerBySocket.set(playerId, playerId);
      return room;
    }
    if (userId) {
      const boundPlayerId = this.userPlayer.get(userId);
      if (boundPlayerId) {
        const boundRoomId = this.playerRoom.get(boundPlayerId);
        const rebound = room.players.find((p) => p.id === boundPlayerId && boundRoomId === room.id);
        if (rebound) {
          const oldPlayerId = rebound.id;
          rebound.id = playerId;
          rebound.connected = true;
          rebound.nickname = nickname.trim() || rebound.nickname;
          this.syncLifecycle(room);
          this.playerRoom.delete(oldPlayerId);
          this.playerRoom.set(playerId, room.id);
          this.userPlayer.set(userId, playerId);
          this.actingPlayerBySocket.set(playerId, playerId);
          if (room.hostId === oldPlayerId) room.hostId = playerId;
          this.remapSelectingPlayer(room, oldPlayerId, playerId);
          if (room.status === 'playing') {
            this.gameService.remapPlayerId(room.id, oldPlayerId, playerId);
            const engine = this.gameService.getRoomEngine(room.id);
            if (engine) this.gameService.syncRoomFromEngine(room, engine);
          }
          return room;
        }
      }
    }
    const rejoin = room.players.find(
      (p) => p.nickname === nickname.trim() && !p.connected,
    );
    if (rejoin) {
      const oldPlayerId = rejoin.id;
      rejoin.id = playerId;
      rejoin.connected = true;
      this.syncLifecycle(room);
      this.playerRoom.delete(oldPlayerId);
      this.playerRoom.set(playerId, room.id);
      this.actingPlayerBySocket.set(playerId, playerId);
      if (room.hostId === oldPlayerId) room.hostId = playerId;
      this.remapSelectingPlayer(room, oldPlayerId, playerId);
      if (room.status === 'playing') {
        this.gameService.remapPlayerId(room.id, oldPlayerId, playerId);
        const engine = this.gameService.getRoomEngine(room.id);
        if (engine) this.gameService.syncRoomFromEngine(room, engine);
      }
      return room;
    }
    if (room.status !== 'waiting') {
      throw new RoomError('E_ROOM_STARTED', '对局已开始，无法加入');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('E_ROOM_FULL', '房间已满');
    }
    room.players.push({
      id: playerId,
      nickname: nickname.trim() || '玩家',
      ready: false,
      connected: true,
    });
    this.syncLifecycle(room);
    this.playerRoom.set(playerId, room.id);
    this.actingPlayerBySocket.set(playerId, playerId);
    this.bindUserIdToPlayer(playerId, userId);
    return room;
  }

  leaveRoom(playerId: string, reason: RoomLeaveReason = 'manual'): LeaveRoomResult {
    this.actingPlayerBySocket.delete(playerId);
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return { room: null, removed: false, disbanded: false };
    const room = this.roomsById.get(roomId);
    if (!room) {
      this.playerRoom.delete(playerId);
      return { room: null, removed: false, disbanded: false };
    }
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return { room, removed: false, disbanded: false };

    const previousHostId = room.hostId;

    if (reason === 'disconnect') {
      room.players[idx].connected = false;
      let newHostId: string | undefined;
      if (room.hostId === playerId) {
        this.syncLifecycle(room, { hostTransferPending: true, disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
        newHostId = this.transferHost(room, playerId);
        if (!newHostId) {
          this.deleteRoom(room);
          return {
            room: null,
            removed: false,
            disbanded: true,
            previousRoomId: room.id,
            previousHostId,
          };
        }
      }
      this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
      return { room, removed: false, disbanded: false, previousRoomId: room.id, previousHostId, newHostId };
    }
    const shouldRemove =
      room.status === 'waiting' || reason === 'manual' || reason === 'evict' || reason === 'room-disband';

    if (!shouldRemove) {
      room.players[idx].connected = false;
      this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
      return { room, removed: false, disbanded: false, previousRoomId: room.id, previousHostId };
    }

    room.players.splice(idx, 1);
    this.playerRoom.delete(playerId);
    this.clearSelectingPlayer(room, playerId);

    if (room.players.length === 0) {
      this.deleteRoom(room);
      return {
        room: null,
        removed: true,
        disbanded: true,
        previousRoomId: room.id,
        previousHostId,
      };
    }

    let newHostId: string | undefined;
    if (previousHostId === playerId) {
      this.syncLifecycle(room, { hostTransferPending: true });
      newHostId = this.transferHost(room, playerId);
      if (!newHostId) {
        this.deleteRoom(room);
        return {
          room: null,
          removed: true,
          disbanded: true,
          previousRoomId: room.id,
          previousHostId,
        };
      }
    }

    if (room.status === 'selecting') {
      this.rebuildGeneralSelectionAfterLeave(room);
    }
    this.syncLifecycle(room);

    return {
      room,
      removed: true,
      disbanded: false,
      previousRoomId: room.id,
      previousHostId,
      newHostId,
      penalty: reason === 'manual' && (room.status === 'selecting' || room.status === 'playing')
        ? MANUAL_LEAVE_PENALTY
        : 0,
    };
  }

  setReady(playerId: string, ready: boolean): Room {
    const room = this.getRoomByPlayerId(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('NOT_IN_ROOM', '不在房间内');
    player.ready = ready;
    this.syncLifecycle(room);
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
    this.setRoomStatus(room, 'selecting');
    assignIdentities(room.players);
    room.players.forEach((p) => {
      p.roleRevealed = p.role === '主公';
      p.general = undefined;
      p.handCards = [];
      p.equipment = [];
      p.judgeCards = [];
      p.handCount = 0;
      p.dead = false;
      p.maxHp = undefined;
      p.hp = undefined;
    });
    this.setupGeneralSelection(room);
    return room;
  }

  selectGeneral(playerId: string, roomCode: string, generalId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.code !== roomCode) {
      throw new RoomError('E_ROOM_NOT_FOUND', '房间不匹配');
    }
    if (room.isSandbox) {
      throw new RoomError('NOT_SUPPORTED', '模拟测试房不需要选将');
    }
    if (room.status !== 'selecting') {
      throw new RoomError('E_NOT_SELECTING', '当前不是选将阶段');
    }
    this.applyGeneralSelection(room, playerId, generalId);
    if (this.isGeneralSelectionComplete(room)) {
      this.startSelectedGame(room);
    }
    return room;
  }

  ensureSandboxRoom(): Room {
    const existing = this.getRoomByCode(SANDBOX_ROOM_CODE);
    if (existing) return existing;
    const version = findVersion(DEFAULT_VERSION_ID)!;
    const maxPlayers = version.maxPlayers;
    const room: Room = {
      id: uuidv4(),
      code: SANDBOX_ROOM_CODE,
      hostId: '',
      maxPlayers,
      versionId: version.id,
      versionName: version.name,
      players: [],
      status: 'waiting',
      settings: { maxPlayers },
      createdAt: Date.now(),
      isSandbox: true,
      sandbox: { phase: 'lobby', turnIndex: 0, round: 1, log: [] },
    };
    this.syncLifecycle(room);
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(room.code, room.id);
    return room;
  }

  joinSandboxRoom(playerId: string, nickname: string, userId?: string | null): Room {
    const room = this.ensureSandboxRoom();
    const trimmedNick = nickname.trim() || '玩家';

    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = trimmedNick || existing.nickname;
      this.syncLifecycle(room);
      this.playerRoom.set(playerId, room.id);
      this.actingPlayerBySocket.set(playerId, playerId);
      return room;
    }

    if (userId) {
      const boundPlayerId = this.userPlayer.get(userId);
      if (boundPlayerId) {
        const rebound = room.players.find((p) => p.id === boundPlayerId && !p.isVirtual);
        if (rebound) {
          const oldId = rebound.id;
          rebound.id = playerId;
          rebound.connected = true;
          rebound.nickname = trimmedNick || rebound.nickname;
          this.syncLifecycle(room);
          this.playerRoom.delete(oldId);
          this.playerRoom.set(playerId, room.id);
          this.userPlayer.set(userId, playerId);
          if (room.hostId === oldId) room.hostId = playerId;
          this.actingPlayerBySocket.set(playerId, playerId);
          if (room.status === 'playing') {
            this.gameService.remapPlayerId(room.id, oldId, playerId);
            const engine = this.gameService.getRoomEngine(room.id);
            if (engine) this.gameService.syncRoomFromEngine(room, engine);
          }
          return room;
        }
      }
    }

    const rejoin = room.players.find(
      (p) => !p.isVirtual && p.nickname === trimmedNick && !p.connected,
    );
    if (rejoin) {
      const oldId = rejoin.id;
      rejoin.id = playerId;
      rejoin.connected = true;
      this.syncLifecycle(room);
      this.playerRoom.delete(oldId);
      this.playerRoom.set(playerId, room.id);
      if (room.hostId === oldId) room.hostId = playerId;
      this.actingPlayerBySocket.set(playerId, playerId);
      if (room.status === 'playing') {
        this.gameService.remapPlayerId(room.id, oldId, playerId);
        const engine = this.gameService.getRoomEngine(room.id);
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
    this.syncLifecycle(room);
    this.playerRoom.set(playerId, room.id);
    this.actingPlayerBySocket.set(playerId, playerId);
    this.bindUserIdToPlayer(playerId, userId);
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
    this.setRoomStatus(room, 'playing');
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

    const engine = this.gameService.createRoomEngine(room);
    engine.start();
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  private requireRoomEngine(room: Room): SangokushiEngine {
    const engine = this.gameService.getRoomEngine(room.id);
    if (!engine) {
      throw new RoomError('ENGINE_MISSING', '对局引擎未初始化');
    }
    return engine;
  }

  private assertPlaying(room: Room): void {
    if (room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    if (room.sandbox.phase === 'finished') {
      throw new RoomError('GAME_OVER', '对局已结束');
    }
  }

  private assertActorInRoom(room: Room, actingPlayerId: string): void {
    const player = room.players.find((p) => p.id === actingPlayerId);
    if (!player?.connected) {
      throw new RoomError('NOT_IN_ROOM', '不在房间内');
    }
  }

  // —— 正式房间对局操作（每人只能操控自己的座位） ——

  gamePlayCard(playerId: string, card: string, handIndex?: number): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxPlayCard(playerId, playerId, card, handIndex);
    }
    this.assertPlaying(room);
    this.assertActorInRoom(room, playerId);
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');
    const engine = this.requireRoomEngine(room);
    const res = engine.initiatePlayCard(playerId, trimmed, handIndex);
    if (!res.ok) throw new RoomError('PLAY_FAILED', res.error ?? '无法出牌');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameConfirmPlay(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxConfirmPlay(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitPromptChoice(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSelectTargets(
    playerId: string,
    promptId: string,
    targetIds: string[],
    zoneCardId?: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSelectTargets(playerId, playerId, promptId, targetIds, zoneCardId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.selectTargets(playerId, promptId, targetIds, zoneCardId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选目标失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSubmitResponse(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSubmitResponse(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitResponse(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '响应失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameUseSkill(playerId: string, skillId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxUseSkill(playerId, playerId, skillId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.initiateSkill(playerId, skillId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '技能失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameRendeGive(
    playerId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxRendeGive(playerId, playerId, targetId, cards, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.rendeGive(
      playerId,
      targetId,
      cards.map((c) => c.trim()).filter(Boolean),
      handIndices,
    );
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '仁德失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameRendeFinish(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxRendeFinish(playerId, playerId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.rendeFinish(playerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束仁德');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameQingnangRecover(playerId: string, targetId: string, handIndices: number | number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxQingnangRecover(playerId, playerId, targetId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.qingnangRecover(playerId, targetId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '青囊失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameZhihengConfirm(playerId: string, handIndices: number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxZhihengConfirm(playerId, playerId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.zhihengConfirm(playerId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '制衡失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameModifyJudge(playerId: string, promptId: string, handIndex: number): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxModifyJudge(playerId, playerId, promptId, handIndex);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.submitModifyJudge(playerId, promptId, handIndex);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '改判失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameSkipModifyJudge(playerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSkipModifyJudge(playerId, playerId, promptId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.skipModifyJudge(playerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameDiscardCards(playerId: string, promptId: string, handIndices: number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxDiscardCards(playerId, playerId, promptId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.submitDiscard(playerId, promptId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameCancelDiscard(playerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxCancelDiscard(playerId, playerId, promptId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.cancelDiscard(playerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '取消弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSelectZoneCard(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSelectZoneCard(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitZoneCard(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameEndTurn(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxEndTurn(playerId, playerId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.endTurn(playerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束回合');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  getFilteredRoomForPlayer(roomId: string, playerId: string): Room | null {
    const room = this.getRoomById(roomId);
    if (!room) return null;
    if (room.status === 'selecting') {
      return this.filterSelectingRoomForPlayer(room, playerId);
    }
    return this.gameService.filterRoomForPlayer(room, playerId);
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
    zoneCardId?: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.selectTargets(
      actingPlayerId,
      promptId,
      targetIds,
      zoneCardId,
    );
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

  sandboxQingnangRecover(
    socketPlayerId: string,
    actingPlayerId: string,
    targetId: string,
    handIndices: number | number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.qingnangRecover(actingPlayerId, targetId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '青囊失败');
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

  sandboxCancelDiscard(socketPlayerId: string, actingPlayerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.cancelDiscard(actingPlayerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '取消弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSelectZoneCard(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitZoneCard(actingPlayerId, promptId, choiceId);
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

  listPublicRooms(versionFilter?: string, viewerPlayerId?: string, viewerUserId?: string): RoomListItem[] {
    this.ensureSandboxRoom();
    const mappedPlayerId = viewerUserId ? this.userPlayer.get(viewerUserId) : undefined;
    return [...this.roomsById.values()]
      .filter((r) => r.players.length > 0 || r.isSandbox)
      .filter((r) => !versionFilter || (r.versionId ?? DEFAULT_VERSION_ID) === versionFilter)
      .map((r) => {
        const isMember = r.players.some((p) => p.id === viewerPlayerId || p.id === mappedPlayerId);
        return {
          code: r.code,
          status: r.status,
          playerCount: r.players.length,
          maxPlayers: r.maxPlayers,
          ownerNickname:
            r.players.find((p) => p.id === r.hostId)?.nickname ?? '—',
          versionId: r.versionId ?? DEFAULT_VERSION_ID,
          versionName:
            r.versionName ?? findVersion(r.versionId ?? DEFAULT_VERSION_ID)?.name ?? '未知版本',
          isSandbox: r.isSandbox,
          isMember,
          joinLabel: isMember ? ('返回' as const) : ('加入' as const),
          _v: 1 as const,
        };
      })
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

  completeFinishedRoom(roomId: string): Room | null {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    if (room.status !== 'finished') return room;

    const victory = room.sandbox?.victory;
    if (victory) {
      room.settlementRecords = [
        ...(room.settlementRecords ?? []),
        {
          id: uuidv4(),
          finishedAt: Date.now(),
          winners: [...victory.winners],
          message: victory.message,
        },
      ];
    }
    this.setRoomStatus(room, 'waiting');
    room.players.forEach((player) => {
      player.ready = false;
    });
    if (room.sandbox) {
      room.sandbox.phase = 'lobby';
      room.sandbox.turnPhase = undefined;
      room.sandbox.prompt = null;
      room.sandbox.victory = null;
    }
    return room;
  }

  private setupGeneralSelection(room: Room): void {
    const optionsByPlayer = new Map<string, string[]>();
    const pool = this.shuffle(CharacterRegistry.getAll().map((ch) => ch.id));
    let cursor = 0;
    for (const player of room.players) {
      const optionCount = player.role === '主公' ? LORD_GENERAL_OPTION_COUNT : GENERAL_OPTION_COUNT;
      const picks: string[] = [];
      while (picks.length < optionCount) {
        const fallback = CharacterRegistry.getAll()[picks.length % CharacterRegistry.getAll().length];
        const id = pool[cursor++ % pool.length] ?? fallback?.id;
        if (id && !picks.includes(id)) picks.push(id);
      }
      optionsByPlayer.set(player.id, picks);
    }
    this.generalOptionsByRoom.set(room.id, optionsByPlayer);
    room.generalSelection = {
      deadlineAt: Date.now() + env.selectingTimeoutSec * 1000,
      timeoutSec: env.selectingTimeoutSec,
      selected: [],
    };
    this.scheduleSelectingTimeout(room);
  }

  private scheduleSelectingTimeout(room: Room): void {
    this.clearSelectingTimer(room.id);
    if (room.status !== 'selecting' || !room.generalSelection) return;
    const delay = Math.max(0, room.generalSelection.deadlineAt - Date.now());
    const timer = setTimeout(() => {
      const latest = this.roomsById.get(room.id);
      if (!latest || latest.status !== 'selecting') return;
      for (const player of latest.players) {
        const alreadySelected = latest.generalSelection?.selected.some((item) => item.playerId === player.id);
        if (alreadySelected) continue;
        const defaultGeneralId = this.generalOptionsByRoom.get(latest.id)?.get(player.id)?.[0];
        if (defaultGeneralId) this.applyGeneralSelection(latest, player.id, defaultGeneralId);
      }
      if (this.isGeneralSelectionComplete(latest)) {
        this.startSelectedGame(latest);
        this.roomChanged?.(latest);
      }
    }, delay);
    this.selectingTimers.set(room.id, timer);
  }

  private clearSelectingTimer(roomId: string): void {
    const timer = this.selectingTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.selectingTimers.delete(roomId);
  }

  private applyGeneralSelection(room: Room, playerId: string, generalId: string): void {
    const options = this.generalOptionsByRoom.get(room.id)?.get(playerId) ?? [];
    if (!options.includes(generalId)) {
      throw new RoomError('E_INVALID_GENERAL_OPTION', '请选择候选武将');
    }
    const ch = CharacterRegistry.getById(generalId);
    if (!ch) throw new RoomError('E_INVALID_GENERAL_OPTION', '武将不存在');
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('PLAYER_NOT_FOUND', '玩家不存在');
    const selectedByOther = room.generalSelection?.selected.some(
      (item) => item.playerId !== playerId && item.generalId === generalId,
    );
    if (selectedByOther) {
      throw new RoomError('E_INVALID_GENERAL_OPTION', '该武将已被选择');
    }
    player.general = ch.name;
    room.generalSelection = room.generalSelection
      ? {
          ...room.generalSelection,
          selected: [
            ...room.generalSelection.selected.filter((item) => item.playerId !== playerId),
            { playerId, generalId: ch.id, generalName: ch.name },
          ],
        }
      : room.generalSelection;
  }

  private isGeneralSelectionComplete(room: Room): boolean {
    const selectedIds = new Set(room.generalSelection?.selected.map((item) => item.playerId) ?? []);
    return room.players.every((player) => selectedIds.has(player.id));
  }

  private startSelectedGame(room: Room): void {
    this.clearSelectingTimer(room.id);
    this.generalOptionsByRoom.delete(room.id);
    this.setRoomStatus(room, 'playing');
    room.generalSelection = undefined;
    room.players.forEach((p) => {
      p.handCards = [];
      p.equipment = [];
      p.judgeCards = [];
      const ch = p.general ? CharacterRegistry.resolve(p.general) : undefined;
      const isLord = p.role === '主公';
      p.maxHp = (ch?.maxHp ?? 4) + (isLord ? 1 : 0);
      p.hp = p.maxHp;
      p.dead = false;
    });
    const turnLordIndex = SangokushiEngine.findLordIndex(room.players);
    room.sandbox = {
      phase: 'playing',
      turnIndex: turnLordIndex,
      round: 1,
      turnPhase: 'judge',
      log: [],
      prompt: null,
    };
    const engine = this.gameService.createRoomEngine(room);
    engine.start();
    this.gameService.syncRoomFromEngine(room, engine);
  }

  private filterSelectingRoomForPlayer(room: Room, playerId: string): Room {
    const clone: Room = JSON.parse(JSON.stringify(room)) as Room;
    if (clone.generalSelection) {
      const optionIds = this.generalOptionsByRoom.get(room.id)?.get(playerId) ?? [];
      clone.generalSelection.myOptions = optionIds
        .map((id) => CharacterRegistry.getById(id))
        .filter((ch): ch is NonNullable<typeof ch> => !!ch)
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          kingdom: ch.kingdom,
          hp: ch.maxHp,
          maxHp: ch.maxHp,
          skills: ch.skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
          })),
        }));
    }
    for (const p of clone.players) {
      const isSelf = p.id === playerId;
      if (!isSelf && p.role !== '主公') p.role = '？';
      p.handCards = [];
      p.handCount = 0;
    }
    return clone;
  }

  private remapSelectingPlayer(room: Room, oldPlayerId: string, newPlayerId: string): void {
    const options = this.generalOptionsByRoom.get(room.id);
    const oldOptions = options?.get(oldPlayerId);
    if (oldOptions) {
      options!.delete(oldPlayerId);
      options!.set(newPlayerId, oldOptions);
    }
    if (room.generalSelection) {
      room.generalSelection.selected = room.generalSelection.selected.map((item) =>
        item.playerId === oldPlayerId ? { ...item, playerId: newPlayerId } : item,
      );
    }
  }

  private clearSelectingPlayer(room: Room, playerId: string): void {
    const options = this.generalOptionsByRoom.get(room.id);
    options?.delete(playerId);
    if (room.generalSelection) {
      room.generalSelection.selected = room.generalSelection.selected.filter(
        (item) => item.playerId !== playerId,
      );
    }
  }

  private rebuildGeneralSelectionAfterLeave(room: Room): void {
    if (room.players.length === 0) return;
    if (!room.generalSelection) {
      this.setupGeneralSelection(room);
      return;
    }

    room.generalSelection = {
      ...room.generalSelection,
      deadlineAt: Date.now() + env.selectingTimeoutSec * 1000,
      timeoutSec: env.selectingTimeoutSec,
    };
    this.scheduleSelectingTimeout(room);
  }

  private transferHost(room: Room, excludingPlayerId?: string): string | undefined {
    const candidates = room.players.filter((p) => !p.isVirtual && p.id !== excludingPlayerId);
    const next = candidates.find((p) => p.connected) ?? candidates[0];
    if (!next) return undefined;
    room.hostId = next.id;
    this.syncLifecycle(room);
    return next.id;
  }

  private setRoomStatus(room: Room, status: Room['status']): void {
    room.status = status;
    this.syncLifecycle(room);
  }

  private syncLifecycle(
    room: Room,
    patch: { hostTransferPending?: boolean; disconnectGraceUntil?: number } = {},
  ): void {
    room.roomLifecycle = {
      state: room.status,
      hostTransferPending: patch.hostTransferPending ?? false,
      disconnectGraceUntil: patch.disconnectGraceUntil,
    };
  }

  private shuffle<T>(arr: T[]): T[] {
    const pile = [...arr];
    for (let i = pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pile[i], pile[j]] = [pile[j]!, pile[i]!];
    }
    return pile;
  }

  private bindUserIdToPlayer(playerId: string, userId?: string | null): void {
    if (userId) this.userPlayer.set(userId, playerId);
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
    this.clearSelectingTimer(room.id);
    this.generalOptionsByRoom.delete(room.id);
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
