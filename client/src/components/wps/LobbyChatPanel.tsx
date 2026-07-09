import { useEffect, useMemo, useRef, useState } from 'react';
import { filterLobbyMessagesForDisplay, type LobbyChatMessage } from '../../store/chatSlice';
import { formatChatTime } from '../../utils/chatTime';
import styles from './LobbyChatPanel.module.css';

interface LobbyChatPanelProps {
  messages: LobbyChatMessage[];
  visible: boolean;
  canSend: boolean;
  onSend: (content: string) => void;
  onViewProfile?: (userId: string) => void;
  onlineCount?: number;
}

export function LobbyChatPanel({
  messages,
  visible,
  canSend,
  onSend,
  onViewProfile,
  onlineCount,
}: LobbyChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const visibleMessages = useMemo(
    () => filterLobbyMessagesForDisplay(messages),
    [messages],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length]);

  if (!visible) return null;

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.title}>
        <span>聊天区（大厅）</span>
        {canSend && onlineCount != null && (
          <span className={styles.online}>在线 {onlineCount}</span>
        )}
      </div>
      {!canSend && (
        <div className={styles.hint}>登录后可发送消息</div>
      )}
      <div className={styles.list} ref={listRef}>
        {visibleMessages.length === 0 && (
          <div className={styles.empty}>暂无消息，在下方输入框发送。</div>
        )}
        {visibleMessages.map((message) => (
          <div key={message.id} className={styles.msg}>
            <button
              type="button"
              className={styles.nameBtn}
              onClick={() => onViewProfile?.(message.userId)}
              title="查看玩家资料"
            >
              {message.nickname}
            </button>
            <span className={styles.time}>{formatChatTime(message.ts)}</span>
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
              if (canSend) handleSubmit();
            }
          }}
          placeholder={canSend ? '输入消息，Enter 发送…' : '请先登录后发送消息'}
          disabled={!canSend}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={!canSend || !input.trim()}
        >
          发送
        </button>
      </div>
    </aside>
  );
}
