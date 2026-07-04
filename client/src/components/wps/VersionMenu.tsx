import { useEffect, useRef, useState } from 'react';
import type { VersionInfo } from '../../api';
import styles from './VersionMenu.module.css';

interface VersionMenuProps {
  versions: VersionInfo[];
  currentVersionId: string;
  disabled?: boolean;
}

export function VersionMenu({
  versions,
  currentVersionId,
  disabled,
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
        title="查看版本信息"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.versionIcon}>📦</span>
        <span className={styles.versionLabel}>{current?.name ?? '版本'}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {versions.map((v) => (
            <div
              key={v.id}
              role="menuitem"
              className={`${styles.menuItem} ${v.id === currentVersionId ? styles.menuItemActive : ''}`}
            >
              {v.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
