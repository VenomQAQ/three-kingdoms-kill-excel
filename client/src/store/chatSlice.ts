/**
 * REQ-2026-001 · FE-7 · 大厅 / 房间聊天状态辅助
 * 对齐 design/api-contract.v1.md §5
 */

export interface LobbyChatMessage {
  id: string;
  userId: string;
  nickname: string;
  content: string;
  ts: number;
  _v?: 1;
}

export type ChatChannel = 'lobby' | 'room' | null;

/** 按 id 去重合并消息，保持时间升序 */
export function mergeLobbyMessages(
  existing: LobbyChatMessage[],
  incoming: LobbyChatMessage[],
): LobbyChatMessage[] {
  const map = new Map<string, LobbyChatMessage>();
  for (const msg of existing) map.set(msg.id, msg);
  for (const msg of incoming) map.set(msg.id, msg);
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

export function appendLobbyMessage(
  existing: LobbyChatMessage[],
  msg: LobbyChatMessage,
): LobbyChatMessage[] {
  if (existing.some((m) => m.id === msg.id)) return existing;
  return [...existing, msg];
}
