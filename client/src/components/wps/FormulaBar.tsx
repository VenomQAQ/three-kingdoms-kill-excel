import styles from './FormulaBar.module.css';

interface FormulaBarProps {
  cellRef: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

export function FormulaBar({
  cellRef,
  value,
  onChange,
  onSubmit,
  placeholder = '输入公式或聊天…',
}: FormulaBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.nameBox}>{cellRef}</div>
      <div className={styles.fx}>fx</div>
      <input
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
