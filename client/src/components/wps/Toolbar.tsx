import styles from './Toolbar.module.css';

const ICONS = ['保存', '撤销', '重做', '复制', '粘贴', 'B', 'I', 'U', '对齐', '合并', '筛选', '排序'];

export function Toolbar() {
  return (
    <div className={styles.bar}>
      {ICONS.map((label) => (
        <button key={label} type="button" className={styles.btn} title={label}>
          <span className={styles.icon}>{label.slice(0, 1)}</span>
        </button>
      ))}
      <div className={styles.divider} />
      <span className={styles.font}>微软雅黑</span>
      <span className={styles.size}>11</span>
    </div>
  );
}
