import type { RoomListItem } from '@tk/shared';
import type { LobbyChatMessage } from '../store/chatSlice';
import { filterLobbyMessagesForDisplay } from '../store/chatSlice';

const ROOM_LIST_KEY = 'tk_room_list_cache_v1';
const LOBBY_CHAT_KEY = 'tk_lobby_chat_cache_v1';

interface RoomListCache {
  versionId: string;
  rooms: RoomListItem[];
  savedAt: number;
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage 满或隐私模式时忽略
  }
}

export function readRoomListCache(versionId?: string): RoomListItem[] {
  const cache = readJson<RoomListCache>(ROOM_LIST_KEY);
  if (!cache?.rooms?.length) return [];
  if (versionId && cache.versionId !== versionId) return [];
  return cache.rooms;
}

export function writeRoomListCache(versionId: string, rooms: RoomListItem[]): void {
  if (!rooms.length) return;
  writeJson(ROOM_LIST_KEY, {
    versionId,
    rooms,
    savedAt: Date.now(),
  } satisfies RoomListCache);
}

export function readLobbyChatCache(): LobbyChatMessage[] {
  const messages = readJson<LobbyChatMessage[]>(LOBBY_CHAT_KEY);
  if (!Array.isArray(messages)) return [];
  return filterLobbyMessagesForDisplay(messages);
}

export function writeLobbyChatCache(messages: LobbyChatMessage[]): void {
  const visible = filterLobbyMessagesForDisplay(messages);
  if (!visible.length) return;
  writeJson(LOBBY_CHAT_KEY, visible);
}
