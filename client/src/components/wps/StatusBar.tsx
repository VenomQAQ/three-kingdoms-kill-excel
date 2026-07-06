import styles from './StatusBar.module.css';

interface StatusBarProps {
  roomCode?: string;
  connected?: boolean;
  playerCount?: number;
  zoom?: number;
}

export function StatusBar({
  roomCode,
  playerCount,
  zoom = 100,
}: StatusBarProps) {
  const left = roomCode
    ? `就绪 | 文档${roomCode} | ${playerCount ?? 0} 人在线`
    : '就绪 | 区域销售汇总.xlsx';

  return (
    <div className={styles.bar}>
      <span className={styles.left}>{left}</span>
      <span className={styles.right}>
        <span className={styles.zoomWrap}>
          <span className={styles.zoomBtn}>−</span>
          <span className={styles.zoomVal}>{zoom}%</span>
          <span className={styles.zoomBtn}>+</span>
        </span>
      </span>
    </div>
  );
}
