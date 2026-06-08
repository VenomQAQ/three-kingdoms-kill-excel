import styles from './SheetTabs.module.css';
import { SHEET_LABELS, SheetId } from '../../data/decoy';

interface SheetTabsProps {
  active: SheetId;
  onSelect: (id: SheetId) => void;
  showGame: boolean;
}

const ALL_SHEETS: SheetId[] = ['sheet1', 'sheet2', 'game'];

export function SheetTabs({ active, onSelect, showGame }: SheetTabsProps) {
  const sheets = showGame ? ALL_SHEETS : ALL_SHEETS.filter((s) => s !== 'game');

  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {sheets.map((id) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${active === id ? styles.active : ''}`}
            onClick={() => onSelect(id)}
          >
            {SHEET_LABELS[id]}
          </button>
        ))}
      </div>
      <button type="button" className={styles.add}>
        +
      </button>
    </div>
  );
}
