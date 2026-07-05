import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@tk/shared';
import { formatChatTime } from '../../utils/chatTime';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  visible: boolean;
  onSend: (content: string) => void;
  onViewProfile?: (message: ChatMessage) => void;
}

export function ChatPanel({ messages, visible, onSend, onViewProfile }: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!visible) return null;

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.title}>聊天区</div>
      <div className={styles.list} ref={listRef}>
        {messages.length === 0 && (
          <div className={styles.empty}>暂无消息，在下方输入框发送。</div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={styles.msg}>
            <button
              type="button"
              className={styles.nameBtn}
              onClick={() => onViewProfile?.(message)}
              title="查看玩家资料"
            >
              {message.nickname}
            </button>
            <span className={styles.time}>{formatChatTime(message.timestamp)}</span>
            <span className={styles.text}>{message.content}</span>
          </div>
        ))}
      </div>
      <div className={styles.inputArea}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="输入消息，Enter 发送..."
          maxLength={200}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          发送
        </button>
      </div>
    </aside>
  );
}
