import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  ClientToServerEvents,
  Room,
  RoomCreateAck,
  RoomJoinAck,
  RoomListItem,
  ServerToClientEvents,
} from '@tk/shared';
import { create } from 'zustand';
import { SANDBOX_ROOM_CODE } from '../data/decoy';
import { sanitizeRoom } from '../utils/display';
import { AuthApi, AuthUser, CapabilitiesApi, Capabilities, HttpError } from '../api';

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

  // REQ-2026-001 · FE-2 · auth / capabilities / 版本偏好
  authStatus: AuthStatus;
  user: AuthUser | null;
  capabilities: Capabilities | null;
  currentVersion: string;

  setNickname: (nickname: string) => void;
  connect: () => void;
  fetchRoomList: () => Promise<void>;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  joinSandbox: () => Promise<void>;
  leaveRoom: () => void;
  toggleReady: () => void;
  startGame: () => void;
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

  // REQ-2026-001 · FE-2 · auth actions
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  setCurrentVersion: (versionId: string) => void;
  markUnauthenticated: (reason?: string) => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socketInstance: GameSocket | null = null;

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

  // REQ-2026-001 · FE-2 · auth 初值
  authStatus: 'loading',
  user: null,
  capabilities: null,
  currentVersion: 'standard-2014',

  setNickname: (nickname) => {
    localStorage.setItem('tk_nickname', nickname);
    set({ nickname });
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

    socket.on('room:created', (room) =>
      set({ room: sanitizeRoom(room), actingPlayerId: get().playerId }),
    );
    socket.on('room:joined', (room) =>
      set({ room: sanitizeRoom(room), actingPlayerId: get().playerId }),
    );
    socket.on('room:state', (room) => set({ room: sanitizeRoom(room) }));
    socket.on('room:error', ({ message }) => set({ lastError: message }));
    socket.on('sandbox:actor', ({ actingPlayerId }) => set({ actingPlayerId }));
    socket.on('chat:message', (msg) =>
      set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
    );
    socket.on('game:started', () => {
      void get().fetchRoomList();
    });

    // REQ-2026-001 · FE-9 · 全局 socket 事件
    (socket as any).on('auth:hello', (payload: any) => {
      // 匿名 socket 会收到 userId=null；已 hydrate 拿到 user 的话以 HTTP /me 结果为准
      // 此事件主要用于断线重连后再次得知服务端观察到的身份
      if (payload && payload.preferredVersion) {
        set({ currentVersion: payload.preferredVersion });
      }
    });
    (socket as any).on('auth:invalidated', (payload: any) => {
      const reason = payload?.reason === 'password-changed' ? '密码已修改，请重新登录' : '登录已失效，请重新登录';
      get().markUnauthenticated(reason);
    });
    (socket as any).on('version:switched', (payload: any) => {
      if (payload && payload.versionId) {
        set({ currentVersion: payload.versionId });
        void get().fetchRoomList();
      }
    });

    set({ socket });
  },

  fetchRoomList: async () => {
    try {
      const res = await fetch('/rooms');
      if (!res.ok) return;
      const list = (await res.json()) as RoomListItem[];
      set({ roomList: list });
    } catch {
      // server offline
    }
  },

  createRoom: async () => {
    const { socket, nickname } = get();
    if (!socket) return;
    return new Promise((resolve, reject) => {
      socket.emit('room:create', { nickname }, (ack?: RoomCreateAck) => {
        if (!ack?.ok) {
          set({ lastError: ack?.error ?? '创建失败' });
          reject(new Error(ack?.error));
          return;
        }
        set({
          room: sanitizeRoom(ack.room),
          playerId: ack.playerId,
          actingPlayerId: ack.playerId,
          chatMessages: [],
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
          set({ lastError: ack?.error ?? '加入失败' });
          reject(new Error(ack?.error));
          return;
        }
        set({
          room: sanitizeRoom(ack.room),
          playerId: ack.playerId,
          actingPlayerId: ack.playerId,
          chatMessages: [],
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

  leaveRoom: () => {
    const { socket } = get();
    socket?.emit('room:leave');
    set({ room: null, chatMessages: [], playerId: null, actingPlayerId: null });
    void get().fetchRoomList();
  },

  toggleReady: () => {
    const { socket, room, actingPlayerId, playerId } = get();
    const id = actingPlayerId ?? playerId;
    if (!socket || !room || !id) return;
    const me = room.players.find((p) => p.id === id);
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
    get().socket?.emit('sandbox:playCard', { card, handIndex });
  },

  sandboxConfirmPlay: (promptId, choiceId) => {
    get().socket?.emit('sandbox:confirmPlay', { promptId, choiceId });
  },

  sandboxSelectTargets: (promptId, targetIds, zoneCardId) => {
    get().socket?.emit('sandbox:selectTargets', { promptId, targetIds, zoneCardId });
  },

  sandboxSubmitResponse: (promptId, choiceId) => {
    get().socket?.emit('sandbox:submitResponse', { promptId, choiceId });
  },

  sandboxUseSkill: (skillId) => {
    get().socket?.emit('sandbox:useSkill', { skillId });
  },

  sandboxRendeGive: (targetId, cards, handIndices) => {
    get().socket?.emit('sandbox:rendeGive', { targetId, cards, handIndices });
  },

  sandboxRendeFinish: () => {
    get().socket?.emit('sandbox:rendeFinish');
  },

  sandboxZhihengConfirm: (handIndices) => {
    get().socket?.emit('sandbox:zhihengConfirm', { handIndices });
  },

  sandboxModifyJudge: (promptId, handIndex) => {
    get().socket?.emit('sandbox:modifyJudge', { promptId, handIndex });
  },

  sandboxSkipModifyJudge: (promptId) => {
    get().socket?.emit('sandbox:skipModifyJudge', { promptId });
  },

  sandboxDiscardCards: (promptId, handIndices) => {
    get().socket?.emit('sandbox:discardCards', { promptId, handIndices });
  },

  sandboxCancelDiscard: (promptId) => {
    get().socket?.emit('sandbox:cancelDiscard', { promptId });
  },

  sandboxSelectZoneCard: (promptId, choiceId) => {
    get().socket?.emit('sandbox:selectZoneCard', { promptId, choiceId });
  },

  sandboxEndTurn: () => {
    get().socket?.emit('sandbox:endTurn');
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

  // ==== REQ-2026-001 · FE-2 · auth actions ====

  hydrate: async () => {
    set({ authStatus: 'loading' });
    // 并发拉 capabilities + me
    const [capsRes, meRes] = await Promise.allSettled([
      CapabilitiesApi.get(),
      AuthApi.me(),
    ]);
    if (capsRes.status === 'fulfilled') {
      set({ capabilities: capsRes.value });
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

  register: async (email, password, nickname) => {
    const u = await AuthApi.register(email, password, nickname);
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
    set({ authStatus: 'guest', user: null, room: null });
  },

  changePassword: async (oldPassword, newPassword) => {
    await AuthApi.changePassword(oldPassword, newPassword);
    // 服务端已使所有 session 失效并广播 auth:invalidated
    set({ authStatus: 'guest', user: null, room: null });
  },

  setCurrentVersion: (versionId: string) => {
    set({ currentVersion: versionId });
    get().socket?.emit('version:switch' as any, { versionId, _v: 1 });
  },

  /** socket 收到 auth:invalidated 时调用 */
  markUnauthenticated: (reason) => {
    set({
      authStatus: 'guest',
      user: null,
      room: null,
      lastError: reason ?? '登录已失效，请重新登录',
    });
  },
}));
