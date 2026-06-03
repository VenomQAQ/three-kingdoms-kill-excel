import styles from './InfoBar.module.css';

interface InfoBarProps {
  nickname: string;
  connected: boolean;
  roomCode?: string;
  roomStatus?: string;
  actingName?: string;
  turnName?: string;
}

export function InfoBar({
  nickname,
  connected,
  roomCode,
  roomStatus,
  actingName,
  turnName,
}: InfoBarProps) {
  return (
    <div className={styles.bar}>
      <span>
        操作员 <strong>{nickname}</strong>
      </span>
      <span className={styles.sep}>|</span>
      <span>
        连接{' '}
        <strong className={connected ? styles.ok : styles.err}>
          {connected ? '已连接' : '未连接'}
        </strong>
      </span>
      {roomCode && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            房间 <strong className={styles.highlight}>{roomCode}</strong>
          </span>
          <span className={styles.sep}>|</span>
          <span>
            状态 <strong>{roomStatus ?? '—'}</strong>
          </span>
        </>
      )}
      {actingName && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            当前操控 <strong className={styles.highlight}>{actingName}</strong>
          </span>
        </>
      )}
      {turnName && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            回合 <strong>{turnName}</strong>
          </span>
        </>
      )}
    </div>
  );
}
