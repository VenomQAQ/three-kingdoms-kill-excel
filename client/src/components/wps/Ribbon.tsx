import { useState } from 'react';
import styles from './Ribbon.module.css';

export type RibbonTab = 'file' | 'home' | 'insert' | 'page' | 'formula' | 'data' | 'review' | 'view';

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'file', label: '文件' },
  { id: 'home', label: '开始' },
  { id: 'insert', label: '插入' },
  { id: 'page', label: '页面' },
  { id: 'formula', label: '公式' },
  { id: 'data', label: '数据' },
  { id: 'review', label: '审阅' },
  { id: 'view', label: '视图' },
];

export interface RibbonAction {
  id: string;
  label: string;
  icon: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface RibbonProps {
  actions: RibbonAction[];
  onAction: (id: string) => void;
}

export function Ribbon({ actions, onAction }: RibbonProps) {
  const [tab, setTab] = useState<RibbonTab>('home');

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'home' ? (
        <div className={styles.ribbon}>
          <div className={styles.group}>
            <button type="button" className={styles.bigBtn} title="粘贴">
              <span className={styles.bigIcon}>📋</span>
              <span>粘贴</span>
            </button>
            <button type="button" className={styles.smallBtn} title="保存">
              <span>💾</span>
              <span>保存</span>
            </button>
          </div>
          <div className={styles.groupDivider} />
          <div className={styles.group}>
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`${styles.actionBtn} ${a.active ? styles.actionActive : ''}`}
                disabled={a.disabled}
                onClick={() => {
                  a.onClick?.();
                  onAction(a.id);
                }}
                title={a.label}
              >
                <span className={styles.actionIcon}>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.groupDivider} />
          <div className={styles.group}>
            <span className={styles.fontLabel}>微软雅黑</span>
            <span className={styles.fontSize}>11</span>
            <button type="button" className={styles.fmtBtn}>
              B
            </button>
            <button type="button" className={styles.fmtBtn}>
              I
            </button>
            <button type="button" className={styles.fmtBtn}>
              U
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.ribbonPlaceholder}>
          <span>{TABS.find((t) => t.id === tab)?.label} 功能区（演示）</span>
        </div>
      )}
    </div>
  );
}
