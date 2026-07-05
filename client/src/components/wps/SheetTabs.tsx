import styles from './SheetTabs.module.css';
import {
  CURRENT_ROOM_SHEET_ID,
  ROOM_LIST_SHEET_ID,
  SALES_SHEET_ID,
  SHEET_LABELS,
  SheetId,
} from '../../data/decoy';

interface SheetTabsProps {
  active: SheetId;
  onSelect: (id: SheetId) => void;
  currentRoomDisabled?: boolean;
}

const ALL_SHEETS: SheetId[] = [ROOM_LIST_SHEET_ID, CURRENT_ROOM_SHEET_ID, SALES_SHEET_ID];

export function SheetTabs({ active, onSelect, currentRoomDisabled }: SheetTabsProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {ALL_SHEETS.map((id) => {
          const disabled = id === CURRENT_ROOM_SHEET_ID && currentRoomDisabled;
          return (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${active === id ? styles.active : ''}`}
              disabled={disabled}
              onClick={() => !disabled && onSelect(id)}
            >
              {SHEET_LABELS[id]}
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.add}>
        +
      </button>
    </div>
  );
}
