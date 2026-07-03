import { useEffect, useRef, useState } from 'react';
import type { VersionInfo } from '../../api';
import styles from './VersionMenu.module.css';

interface VersionMenuProps {
  versions: VersionInfo[];
  currentVersionId: string;
  disabled?: boolean;
  onSelect: (versionId: string) => void;
}

export function VersionMenu({
  versions,
  currentVersionId,
  disabled,
  onSelect,
}: VersionMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.id === currentVersionId) ?? versions[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={styles.versionGroup} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.versionBtn} ${open ? styles.versionBtnOpen : ''}`}
        disabled={disabled}
        title="切换三国杀版本"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.versionIcon}>📦</span>
        <span className={styles.versionLabel}>{current?.name ?? '版本'}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${v.id === currentVersionId ? styles.menuItemActive : ''}`}
              onClick={() => {
                onSelect(v.id);
                setOpen(false);
              }}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
