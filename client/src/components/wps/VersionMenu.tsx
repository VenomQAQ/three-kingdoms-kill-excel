import { useEffect, useRef, useState } from 'react';
import type { GameType } from '@tk/shared';
import { CapabilitiesApi, type VersionDetail, type VersionInfo } from '../../api';
import styles from './VersionMenu.module.css';

interface VersionMenuProps {
  versions: VersionInfo[];
  currentVersionId: string;
  disabled?: boolean;
  gameType?: GameType;
  onGameTypeChange?: (type: GameType) => void;
}

export function VersionMenu({
  versions,
  currentVersionId,
  disabled,
  gameType = 'sanguosha',
  onGameTypeChange,
}: VersionMenuProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.id === currentVersionId) ?? versions[0];
  const currentLabel = gameType === 'monopoly' ? '世界版大富翁' : current?.name ?? '版本';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openDetail = (versionId: string) => {
    setOpen(false);
    setLoadingDetail(true);
    setDetailError(null);
    void CapabilitiesApi.getVersionDetail(versionId)
      .then(setDetail)
      .catch((err) => {
        setDetailError(err instanceof Error ? err.message : '版本详情加载失败');
      })
      .finally(() => setLoadingDetail(false));
  };

  return (
    <div className={styles.versionGroup} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.versionBtn} ${open ? styles.versionBtnOpen : ''}`}
        disabled={disabled}
        title="查看版本信息"
        onClick={() => {
          if (gameType === 'monopoly') {
            setOpen((v) => !v);
            return;
          }
          openDetail(current?.id ?? currentVersionId);
        }}
      >
        <span className={styles.versionIcon}>📦</span>
        <span className={styles.versionLabel}>{currentLabel}</span>
      </button>
      <button
        type="button"
        className={styles.menuToggle}
        disabled={disabled}
        title="选择查看版本"
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {versions.map((v) => (
            <button
              type="button"
              key={v.id}
              role="menuitem"
              className={`${styles.menuItem} ${gameType === 'sanguosha' && v.id === currentVersionId ? styles.menuItemActive : ''}`}
              onClick={() => {
                onGameTypeChange?.('sanguosha');
                openDetail(v.id);
              }}
            >
              {v.name}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${gameType === 'monopoly' ? styles.menuItemActive : ''}`}
            onClick={() => {
              setOpen(false);
              onGameTypeChange?.('monopoly');
            }}
          >
            世界版大富翁
          </button>
        </div>
      )}
      {(detail || loadingDetail || detailError) && (
        <div className={styles.overlay} onClick={() => setDetail(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h2>{detail?.name ?? '版本详情'}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            <div className={styles.dialogBody}>
              {loadingDetail ? (
                <p className={styles.statusText}>正在加载...</p>
              ) : detailError ? (
                <p className={styles.errorText}>{detailError}</p>
              ) : detail ? (
                <>
                  <div className={styles.summaryGrid}>
                    <span>版本 ID</span>
                    <strong>{detail.id}</strong>
                    <span>人数范围</span>
                    <strong>{detail.minPlayers}-{detail.maxPlayers} 人</strong>
                    <span>武将数量</span>
                    <strong>{detail.generals.length}</strong>
                    <span>开放门槛</span>
                    <strong>{detail.unlockHint}</strong>
                  </div>
                  <section className={styles.section}>
                    <h3>武将目录</h3>
                    <div className={styles.tagList}>
                      {detail.generals.map((general) => (
                        <span key={general.id}>{general.name} · {general.hp} 体力</span>
                      ))}
                    </div>
                  </section>
                  <section className={styles.section}>
                    <h3>卡牌目录</h3>
                    <div className={styles.cardGroups}>
                      <p><strong>基本牌</strong>{detail.cards.basic.join('、')}</p>
                      <p><strong>锦囊牌</strong>{detail.cards.trick.join('、')}</p>
                      <p><strong>装备牌</strong>{detail.cards.equipment.join('、')}</p>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
