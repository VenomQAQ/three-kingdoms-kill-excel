import styles from './MenuBar.module.css';

const MENUS = ['文件', '编辑', '视图', '插入', '格式', '工具', '数据', '帮助'];

export function MenuBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.logo}>WPS 表格</div>
      {MENUS.map((m) => (
        <button key={m} type="button" className={styles.item}>
          {m}
        </button>
      ))}
    </div>
  );
}
