import { ChatMessage } from '@tk/shared';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  visible: boolean;
}

export function ChatPanel({ messages, visible }: ChatPanelProps) {
  if (!visible) return null;

  return (
    <aside className={styles.panel}>
      <div className={styles.title}>审阅 · 消息</div>
      <div className={styles.list}>
        {messages.length === 0 && (
          <div className={styles.empty}>暂无消息，在公式栏输入后 Enter 发送</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={styles.msg}>
            <span className={styles.name}>{m.nickname}</span>
            <span className={styles.text}>{m.content}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
