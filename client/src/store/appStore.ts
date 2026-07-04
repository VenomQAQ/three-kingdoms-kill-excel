import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  ClientToServerEvents,
  Room,
  RoomCreateAck,
  RoomJoinAck,
  RoomLeaveReason,
  RoomListItem,
  ServerToClientEvents,
} from '@tk/shared';
import { create } from 'zustand';
import { SANDBOX_ROOM_CODE } from '../data/decoy';
import { translateError } from '../data/errorMessages';
import { sanitizeRoom } from '../utils/display';
import { AuthApi, AuthUser, CapabilitiesApi, Capabilities, HttpError } from '../api';
import {
  appendLobbyMessage,
  ChatChannel,
  LobbyChatMessage,
  mergeLobbyMessages,
} from './chatSlice';
import { useToastStore } from './toastStore';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** REQ-2026-001 · FE-2 · 认证状态机 */
export type AuthStatus = 'loading' | 'guest' | 'authed';

interface AppState {
  socket: GameSocket | null;
  connected: boolean;
  playerId: string | null;
  actingPlayerId: string | null;
  nickname: string;
  room: Room | null;
  roomList: RoomListItem[];
  chatMessages: ChatMessage[];
  lastError: string | null;

  // REQ-2026-001 · FE-7 · 大厅聊天
  lobbyMessages: LobbyChatMessage[];
  chatChannel: ChatChannel;

  // REQ-2026-001 · FE-2 · auth / capabilities / 版本偏好
  authStatus: AuthStatus;
  user: AuthUser | null;
  capabilities: Capabilities | null;
  currentVersion: string;

  setNickname: (nickname: string) => Promise<void>;
  connect: () => void;
  fetchRoomList: () => Promise<void>;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  joinSandbox: () => Promise<void>;
  leaveRoom: (reason?: RoomLeaveReason) => void;
  toggleReady: () => void;
  startGame: () => void;
  selectGeneral: (generalId: string) => void;
  sandboxAddPlayer: (nickname: string, general?: string) => void;
  sandboxRemoveLastVirtual: () => void;
  sandboxSwitchActor: (playerId: string) => void;
  sandboxStart: () => void;
  sandboxPlayCard: (card: string, handIndex?: number) => void;
  sandboxConfirmPlay: (promptId: string, choiceId: string) => void;
  sandboxSelectTargets: (promptId: string, targetIds: string[], zoneCardId?: string) => void;
  sandboxSubmitResponse: (promptId: string, choiceId: string) => void;
  sandboxUseSkill: (skillId: string) => void;
  sandboxRendeGive: (
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ) => void;
  sandboxRendeFinish: () => void;
  sandboxZhihengConfirm: (handIndices: number[]) => void;
  sandboxModifyJudge: (promptId: string, handIndex: number) => void;
  sandboxSkipModifyJudge: (promptId: string) => void;
  sandboxDiscardCards: (promptId: string, handIndices: number[]) => void;
  sandboxCancelDiscard: (promptId: string) => void;
  sandboxSelectZoneCard: (promptId: string, choiceId: string) => void;
  sandboxEndTurn: () => void;
  sendChat: (content: string) => void;
  clearError: () => void;
  subscribeLobbyChat: () => void;
  unsubscribeLobbyChat: () => void;
  sendLobbyChat: (content: string) => void;
  showError: (code?: string | null, fallback?: string) => void;

  // REQ-2026-001 · FE-2 · auth actions
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  setCurrentVersion: (versionId: string) => void;
  markUnauthenticated: (reason?: string) => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socketInstance: GameSocket | null = null;

/** 重连后服务端会迁移 playerId，用昵称回对齐本地 id */
function applyRoomState(
  room: Room,
  prev: { playerId: string | null; actingPlayerId: string | null; nickname: string },
): { room: Room; playerId: string | null; actingPlayerId: string | null } {
  const sanitized = sanitizeRoom(room);
  let playerId = prev.playerId;
  if (!playerId || !sanitized.players.some((p) => p.id === playerId)) {
    const mine = sanitized.players.find(
      (p) => !p.isVirtual && p.nickname === prev.nickname,
    );
    if (mine) playerId = mine.id;
  }
  let actingPlayerId = prev.actingPlayerId;
  if (
    actingPlayerId &&
    !sanitized.players.some((p) => p.id === actingPlayerId)
  ) {
    actingPlayerId = playerId;
  }
  return { room: sanitized, playerId, actingPlayerId };
}

/** 根据房间类型路由 sandbox:* 或 game:* 事件 */
function routeGameEmit(
  socket: GameSocket,
  room: Room,
  sandboxEvent: string,
  formalEvent: string,
  payload?: unknown,
): void {
  const event = room.isSandbox ? sandboxEvent : formalEvent;
  if (payload === undefined) {
    (socket.emit as (e: string) => void)(event);
  } else {
    (socket.emit as (e: string, p: unknown) => void)(event, payload);
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  socket: null,
  connected: false,
  playerId: null,
  actingPlayerId: null,
  nickname: localStorage.getItem('tk_nickname') ?? '表格用户',
  room: null,
  roomList: [],
  chatMessages: [],
  lastError: null,
  lobbyMessages: [],
  chatChannel: null,

  // REQ-2026-001 · FE-2 · auth 初值
  authStatus: 'loading',
  user: null,
  capabilities: null,
  currentVersion: 'standard-2014',

  setNickname: async (nickname) => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    if (get().authStatus === 'authed') {
      const user = await AuthApi.updateProfile(trimmed);
      localStorage.setItem('tk_nickname', user.nickname);
      set({ user, nickname: user.nickname });
      return;
    }
    localStorage.setItem('tk_nickname', trimmed);
    set({ nickname: trimmed });
  },

  connect: () => {
    if (socketInstance) {
      set({
        socket: socketInstance,
        connected: socketInstance.connected,
      });
      if (!socketInstance.connected) {
        socketInstance.connect();
      }
      return;
    }

    const socket: GameSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketInstance = socket;

    socket.on('connect', () => {
      set({ connected: true, socket });
      void get().fetchRoomList();
    });
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('room:created', (room) => set((s) => applyRoomState(room, s)));
    socket.on('room:joined', (room) => set((s) => applyRoomState(room, s)));
    socket.on('room:state', (room) => set((s) => applyRoomState(room, s)));
    socket.on('room:error', ({ code, message }) =>
      set({ lastError: translateError(code, message) }),
    );
    socket.on('sandbox:actor', ({ actingPlayerId }) => set({ actingPlayerId }));
    socket.on('chat:message', (msg) =>
      set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
    );
    socket.on('game:started', () => {
      void get().fetchRoomList();
    });
    socket.on('game:finished', ({ victory }) => {
      useToastStore.getState().show(victory?.message ?? '对局结束');
    });
    socket.on('game:event', ({ message }) => {
      if (message) useToastStore.getState().show(message);
    });

    (socket as any).on('lobby:chat:message', (msg: LobbyChatMessage) => {
      if (get().chatChannel !== 'lobby') return;
      set((s) => ({ lobbyMessages: appendLobbyMessage(s.lobbyMessages, msg) }));
    });
    (socket as any).on('chat:error', (payload: { code?: string; message?: string; scope?: string }) => {
      if (payload?.scope === 'lobby') {
        set({ lastError: translateError(payload.code, payload.message) });
      }
    });

    // REQ-2026-001 · FE-9 · 全局 socket 事件
    (socket as any).on('auth:hello', (payload: any) => {
      // 匿名 socket 会收到 userId=null；已 hydrate 拿到 user 的话以 HTTP /me 结果为准
      // 此事件主要用于断线重连后再次得知服务端观察到的身份
      if (payload?.preferredVersion) {
        set({ currentVersion: payload.preferredVersion });
      }
      if (payload?.playerId) {
        set((s) => ({
          playerId: payload.playerId,
          actingPlayerId: s.actingPlayerId ?? payload.playerId,
        }));
      }
    });
    (socket as any).on('auth:invalidated', (payload: any) => {
      const reason = payload?.reason === 'password-changed' ? '密码已修改，请重新登录' : '登录已失效，请重新登录';
      get().markUnauthenticated(reason);
    });
    (socket as any).on('user:nicknameChanged', (payload: any) => {
      if (typeof payload?.nickname !== 'string') return;
      const nickname = payload.nickname;
      localStorage.setItem('tk_nickname', nickname);
      set((s) => ({
        nickname,
        user: s.user ? { ...s.user, nickname } : s.user,
      }));
    });
    socket.on('user:walletChanged', ({ coins, experience, level }) => {
      set((s) => ({
        user: s.user ? { ...s.user, coins, experience, level } : s.user,
      }));
    });
    (socket as any).on('version:switched', (payload: any) => {
      if (payload && payload.versionId) {
        set({ currentVersion: payload.versionId });
        void get().fetchRoomList();
        const name =
          get().capabilities?.versions.find((v) => v.id === payload.versionId)?.name ??
          payload.versionId;
        useToastStore.getState().show(`已切换至 ${name}`);
      }
    });

    set({ socket });
  },

  fetchRoomList: async () => {
    const { socket, currentVersion } = get();
    if (!socket) return;
    return new Promise<void>((resolve) => {
      socket.emit(
        'room:list' as any,
        { versionId: currentVersion, _v: 1 },
        (list?: RoomListItem[]) => {
          if (Array.isArray(list)) set({ roomList: list });
          resolve();
        },
      );
      // 无 ack 时避免悬挂
      setTimeout(resolve, 3000);
    });
  },

  createRoom: async () => {
    const { socket, nickname, currentVersion } = get();
    if (!socket) return;
    return new Promise((resolve, reject) => {
      socket.emit(
        'room:create',
        { nickname, versionId: currentVersion } as { nickname: string },
        (ack?: RoomCreateAck) => {
        if (!ack?.ok) {
          const code = (ack as { code?: string } | undefined)?.code;
          set({ lastError: translateError(code, ack?.error ?? '创建失败') });
          reject(new Error(ack?.error));
          return;
        }
        get().unsubscribeLobbyChat();
        set({
          room: sanitizeRoom(ack.room),
          playerId: ack.playerId,
          actingPlayerId: ack.playerId,
          chatMessages: [],
          chatChannel: 'room',
        });
        socket.emit('chat:history', (history) => {
          if (history?.length) set({ chatMessages: history });
        });
        void get().fetchRoomList();
        resolve();
      });
    });
  },

  joinRoom: async (code) => {
    const { socket, nickname } = get();
    if (!socket) return;
    const raw = code.trim();
    const trimmed = raw === SANDBOX_ROOM_CODE ? raw : raw.replace(/\D/g, '').slice(0, 8);
    if (trimmed.length !== 8) {
      set({ lastError: '请输入 8 位房间号' });
      return;
    }
    return new Promise((resolve, reject) => {
      socket.emit('room:join', { code: trimmed, nickname }, (ack?: RoomJoinAck) => {
        if (!ack?.ok) {
          const codeErr = (ack as { code?: string } | undefined)?.code;
          set({ lastError: translateError(codeErr, ack?.error ?? '加入失败') });
          reject(new Error(ack?.error));
          return;
        }
        get().unsubscribeLobbyChat();
        set({
          room: sanitizeRoom(ack.room),
          playerId: ack.playerId,
          actingPlayerId: ack.playerId,
          chatMessages: [],
          chatChannel: 'room',
        });
        socket.emit('chat:history', (history) => {
          if (history?.length) set({ chatMessages: history });
        });
        void get().fetchRoomList();
        resolve();
      });
    });
  },

  joinSandbox: async () => get().joinRoom(SANDBOX_ROOM_CODE),

  leaveRoom: (reason = 'manual') => {
    const { socket, room } = get();
    socket?.emit('room:leave', { code: room?.code, reason, _v: 1 } as Parameters<ClientToServerEvents['room:leave']>[0]);
    set({ room: null, chatMessages: [], playerId: null, actingPlayerId: null, chatChannel: null });
    void get().fetchRoomList();
  },

  toggleReady: () => {
    const { socket, room, playerId, nickname } = get();
    if (!socket || !room) return;
    const me =
      (playerId ? room.players.find((p) => p.id === playerId) : undefined) ??
      room.players.find((p) => !p.isVirtual && p.nickname === nickname);
    socket.emit('room:ready', { ready: !me?.ready });
  },

  startGame: () => {
    const { socket, room } = get();
    if (!socket || !room) return;
    if (room.isSandbox) {
      socket.emit('sandbox:start');
    } else {
      socket.emit('room:start');
    }
  },

  selectGeneral: (generalId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    socket.emit('general:select', { roomCode: room.code, generalId, _v: 1 });
  },

  sandboxAddPlayer: (nickname, general) => {
    get().socket?.emit('sandbox:addPlayer', { nickname, general });
  },

  sandboxRemoveLastVirtual: () => {
    const { room, socket } = get();
    if (!room || !socket) return;
    const virtuals = room.players.filter((p) => p.isVirtual);
    const last = virtuals[virtuals.length - 1];
    if (last) socket.emit('sandbox:removePlayer', { playerId: last.id });
  },

  sandboxSwitchActor: (targetId) => {
    get().socket?.emit('sandbox:switchActor', { playerId: targetId });
    set({ actingPlayerId: targetId });
  },

  sandboxStart: () => {
    get().socket?.emit('sandbox:start');
  },

  sandboxPlayCard: (card, handIndex) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:playCard', 'game:playCard', { card, handIndex });
  },

  sandboxConfirmPlay: (promptId, choiceId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:confirmPlay', 'game:confirmPlay', {
      promptId,
      choiceId,
    });
  },

  sandboxSelectTargets: (promptId, targetIds, zoneCardId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:selectTargets', 'game:selectTargets', {
      promptId,
      targetIds,
      zoneCardId,
    });
  },

  sandboxSubmitResponse: (promptId, choiceId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:submitResponse', 'game:submitResponse', {
      promptId,
      choiceId,
    });
  },

  sandboxUseSkill: (skillId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:useSkill', 'game:useSkill', { skillId });
  },

  sandboxRendeGive: (targetId, cards, handIndices) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:rendeGive', 'game:rendeGive', {
      targetId,
      cards,
      handIndices,
    });
  },

  sandboxRendeFinish: () => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:rendeFinish', 'game:rendeFinish');
  },

  sandboxZhihengConfirm: (handIndices) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:zhihengConfirm', 'game:zhihengConfirm', {
      handIndices,
    });
  },

  sandboxModifyJudge: (promptId, handIndex) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:modifyJudge', 'game:modifyJudge', {
      promptId,
      handIndex,
    });
  },

  sandboxSkipModifyJudge: (promptId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:skipModifyJudge', 'game:skipModifyJudge', {
      promptId,
    });
  },

  sandboxDiscardCards: (promptId, handIndices) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:discardCards', 'game:discardCards', {
      promptId,
      handIndices,
    });
  },

  sandboxCancelDiscard: (promptId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:cancelDiscard', 'game:cancelDiscard', {
      promptId,
    });
  },

  sandboxSelectZoneCard: (promptId, choiceId) => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:selectZoneCard', 'game:selectZoneCard', {
      promptId,
      choiceId,
    });
  },

  sandboxEndTurn: () => {
    const { socket, room } = get();
    if (!socket || !room) return;
    routeGameEmit(socket, room, 'sandbox:endTurn', 'game:endTurn');
  },

  sendChat: (content) => {
    const trimmed = content.trim();
    if (!trimmed.startsWith('/')) {
      get().socket?.emit('chat:send', { content: trimmed });
      return;
    }
    get().socket?.emit('chat:send', { content: trimmed });
  },

  clearError: () => set({ lastError: null }),

  showError: (code, fallback) => {
    set({ lastError: translateError(code, fallback) });
  },

  subscribeLobbyChat: () => {
    const { socket } = get();
    if (!socket) return;
    set({ chatChannel: 'lobby', lobbyMessages: [] });
    socket.emit('lobby:chat:snapshot' as any, { _v: 1 }, (messages?: LobbyChatMessage[]) => {
      if (get().chatChannel !== 'lobby') return;
      if (messages?.length) {
        set((s) => ({ lobbyMessages: mergeLobbyMessages(s.lobbyMessages, messages) }));
      }
    });
  },

  unsubscribeLobbyChat: () => {
    set({ chatChannel: null, lobbyMessages: [] });
  },

  sendLobbyChat: (content) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const maxLen = get().capabilities?.chatLimits.maxLength ?? 200;
    if (trimmed.length > maxLen) {
      set({ lastError: translateError('E_CHAT_TOO_LONG') });
      return;
    }
    get().socket?.emit('lobby:chat:send' as any, { content: trimmed, _v: 1 });
  },

  // ==== REQ-2026-001 · FE-2 · auth actions ====

  hydrate: async () => {
    set({ authStatus: 'loading' });
    // 并发拉 capabilities + me
    const [capsRes, meRes] = await Promise.allSettled([
      CapabilitiesApi.get(),
      AuthApi.me(),
    ]);
    if (capsRes.status === 'fulfilled') {
      const caps = capsRes.value;
      set({
        capabilities: caps,
        currentVersion:
          get().user?.preferredVersion ??
          caps.versions.find((v) => v.default)?.id ??
          get().currentVersion,
      });
    }
    if (meRes.status === 'fulfilled') {
      const u = meRes.value;
      set({
        authStatus: 'authed',
        user: u,
        currentVersion: u.preferredVersion,
        nickname: u.nickname,
      });
    } else {
      set({ authStatus: 'guest', user: null });
    }
  },

  login: async (email, password) => {
    const u = await AuthApi.login(email, password);
    set({
      authStatus: 'authed',
      user: u,
      currentVersion: u.preferredVersion,
      nickname: u.nickname,
    });
  },

  register: async (email, password, nickname, confirmPassword) => {
    const u = await AuthApi.register(email, password, nickname, confirmPassword);
    set({
      authStatus: 'authed',
      user: u,
      currentVersion: u.preferredVersion,
      nickname: u.nickname,
    });
  },

  logout: async () => {
    try {
      await AuthApi.logout();
    } catch (err) {
      // logout 应幂等；忽略网络/500
      if (!(err instanceof HttpError)) throw err;
    }
    set({ authStatus: 'guest', user: null, room: null, chatChannel: null });
  },

  changePassword: async (oldPassword, newPassword) => {
    await AuthApi.changePassword(oldPassword, newPassword);
    // 服务端已使所有 session 失效并广播 auth:invalidated
    set({ authStatus: 'guest', user: null, room: null, chatChannel: null });
  },

  setCurrentVersion: (versionId: string) => {
    get().socket?.emit('version:switch' as any, { versionId, _v: 1 });
  },

  /** socket 收到 auth:invalidated 时调用 */
  markUnauthenticated: (reason) => {
    set({
      authStatus: 'guest',
      user: null,
      room: null,
      chatChannel: null,
      lastError: reason ?? translateError('E_UNAUTHORIZED'),
    });
  },
}));
