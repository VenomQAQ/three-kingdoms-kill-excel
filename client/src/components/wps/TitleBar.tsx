import styles from './TitleBar.module.css';

interface TitleBarProps {
  fileName: string;
  accountLabel: string;
  isAuthed?: boolean;
  onLogout?: () => void;
}

export function TitleBar({ fileName, accountLabel, isAuthed, onLogout }: TitleBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <button type="button" className={styles.iconBtn} title="保存">
          💾
        </button>
        <button type="button" className={styles.iconBtn} title="撤销">
          ↩
        </button>
        <span className={styles.divider} />
        <span className={styles.logo}>W</span>
        <span className={styles.brand}>WPS 表格</span>
        <span className={styles.sep}>|</span>
        <span className={styles.fileName}>{fileName}</span>
      </div>
      <div className={styles.search}>
        <input type="text" placeholder="搜索功能、模板、帮助…" readOnly />
      </div>
      <span className={styles.account}>{accountLabel}</span>
      {isAuthed && (
        <button type="button" className={styles.share} onClick={onLogout}>
          退出登录
        </button>
      )}
      {/* <button type="button" className={styles.share}>
        共享
      </button> */}
    </div>
  );
}
