import { useEffect, useMemo, useState } from 'react';
import styles from './SheetTabs.module.css';
import {
  CRIME_SUDOKU_SHEET_ID,
  CURRENT_ROOM_SHEET_ID,
  HIT_BOSS_SHEET_ID,
  LIANLIANKAN_SHEET_ID,
  RECON_CHECK_SHEET_ID,
  CARD_FLIP_SHEET_ID,
  TYPING_MAZE_SHEET_ID,
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

const ALL_SHEETS: SheetId[] = [
  ROOM_LIST_SHEET_ID,
  CURRENT_ROOM_SHEET_ID,
  LIANLIANKAN_SHEET_ID,
  CRIME_SUDOKU_SHEET_ID,
  HIT_BOSS_SHEET_ID,
  RECON_CHECK_SHEET_ID,
  CARD_FLIP_SHEET_ID,
  TYPING_MAZE_SHEET_ID,
  SALES_SHEET_ID,
];
const STORAGE_KEY = 'tk_sheet_labels';

function loadLocalLabels(): Partial<Record<SheetId, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      ALL_SHEETS
        .map((id) => [id, typeof parsed[id] === 'string' ? String(parsed[id]).slice(0, 16) : undefined] as const)
        .filter((entry): entry is [SheetId, string] => Boolean(entry[1]?.trim())),
    ) as Partial<Record<SheetId, string>>;
  } catch {
    return {};
  }
}

export function SheetTabs({ active, onSelect, currentRoomDisabled }: SheetTabsProps) {
  const [labels, setLabels] = useState<Partial<Record<SheetId, string>>>(() => loadLocalLabels());
  const [menuSheet, setMenuSheet] = useState<SheetId | null>(null);
  const displayLabels = useMemo(() => ({ ...SHEET_LABELS, ...labels }), [labels]);

  useEffect(() => {
    if (!menuSheet) return;
    const close = () => setMenuSheet(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuSheet]);

  const renameSheet = (id: SheetId) => {
    const next = window.prompt('请输入工作表名称', displayLabels[id])?.trim();
    if (!next) return;
    const clipped = next.slice(0, 16);
    const updated = { ...labels, [id]: clipped };
    setLabels(updated);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {ALL_SHEETS.map((id) => {
          const disabled = id === CURRENT_ROOM_SHEET_ID && currentRoomDisabled;
          return (
            <span key={id} className={styles.tabWrap}>
              <button
                type="button"
                className={`${styles.tab} ${active === id ? styles.active : ''}`}
                disabled={disabled}
                onClick={() => !disabled && onSelect(id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenuSheet(id);
                }}
              >
                {displayLabels[id]}
              </button>
              {menuSheet === id ? (
                <div className={styles.contextMenu} onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuSheet(null);
                      renameSheet(id);
                    }}
                  >
                    重命名
                  </button>
                </div>
              ) : null}
            </span>
          );
        })}
      </div>
      <button type="button" className={styles.add}>
        +
      </button>
    </div>
  );
}
