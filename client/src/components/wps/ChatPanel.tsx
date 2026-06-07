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
      <div className={styles.title}>聊天区</div>
      <div className={styles.list}>
        {messages.length === 0 && (
          <div className={styles.empty}>暂无消息，在公式栏输入后按 Enter 发送。</div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={styles.msg}>
            <span className={styles.name}>{message.nickname}</span>
            <span className={styles.text}>{message.content}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
