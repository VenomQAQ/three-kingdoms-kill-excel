import styles from './SpreadsheetGrid.module.css';
import { COL_LABELS, DECOY_HEADERS, DECOY_ROWS } from '../../data/decoy';

interface SpreadsheetGridProps {
  selectedCell: string;
  onSelectCell: (ref: string) => void;
}

export function DecoyGrid({ selectedCell, onSelectCell }: SpreadsheetGridProps) {
  const cols = COL_LABELS.slice(0, DECOY_HEADERS.length);
  const rowCount = 30;

  return (
    <div className={styles.wrap}>
      <div className={styles.corner} />
      <div className={styles.colHeaders}>
        {cols.map((c) => (
          <div key={c} className={styles.colHeader}>
            {c}
          </div>
        ))}
      </div>
      <div className={styles.body}>
        {Array.from({ length: rowCount }, (_, ri) => {
          const rowNum = ri + 1;
          const decoyRow = ri === 0 ? DECOY_HEADERS : DECOY_ROWS[ri - 1];
          return (
            <div key={rowNum} className={styles.row}>
              <div className={styles.rowHeader}>{rowNum}</div>
              {cols.map((col, ci) => {
                const ref = `${col}${rowNum}`;
                const value = decoyRow?.[ci] ?? '';
                const isHeader = ri === 0;
                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${ref === selectedCell ? styles.selected : ''} ${isHeader ? styles.headerCell : ''}`}
                    onClick={() => onSelectCell(ref)}
                  >
                    {value}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
