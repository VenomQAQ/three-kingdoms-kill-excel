import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@tk/shared';

const MAX_MESSAGES = 100;
const MIN_CHAT_INTERVAL_MS = 300;
const MAX_CHAT_LENGTH = 200;

@Injectable()
export class ChatService {
  private readonly messagesByRoom = new Map<string, ChatMessage[]>();
  private readonly lastSendAt = new Map<string, number>();

  send(
    roomId: string,
    playerId: string,
    nickname: string,
    content: string,
  ): ChatMessage {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new ChatError('EMPTY_MESSAGE', '消息不能为空');
    }
    if ([...trimmed].length > MAX_CHAT_LENGTH) {
      throw new ChatError('E_CHAT_TOO_LONG', `单条消息 ≤ ${MAX_CHAT_LENGTH} 字符`);
    }

    const now = Date.now();
    const last = this.lastSendAt.get(playerId) ?? 0;
    if (now - last < MIN_CHAT_INTERVAL_MS) {
      throw new ChatError('E_CHAT_RATE_LIMIT', '发送过快，请稍后再试');
    }
    this.lastSendAt.set(playerId, now);

    const message: ChatMessage = {
      id: uuidv4(),
      roomId,
      playerId,
      nickname,
      content: trimmed,
      timestamp: now,
    };

    const list = this.messagesByRoom.get(roomId) ?? [];
    list.push(message);
    if (list.length > MAX_MESSAGES) {
      list.splice(0, list.length - MAX_MESSAGES);
    }
    this.messagesByRoom.set(roomId, list);
    return message;
  }

  system(roomId: string, content: string): ChatMessage {
    const message: ChatMessage = {
      id: uuidv4(),
      roomId,
      playerId: 'system',
      nickname: '系统',
      content: content.trim(),
      timestamp: Date.now(),
      system: true,
    };
    const list = this.messagesByRoom.get(roomId) ?? [];
    list.push(message);
    if (list.length > MAX_MESSAGES) {
      list.splice(0, list.length - MAX_MESSAGES);
    }
    this.messagesByRoom.set(roomId, list);
    return message;
  }

  getHistory(roomId: string): ChatMessage[] {
    return [...(this.messagesByRoom.get(roomId) ?? [])];
  }

  clearRoom(roomId: string): void {
    this.messagesByRoom.delete(roomId);
  }
}

export class ChatError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}
