import { useState } from 'react';
import styles from './Ribbon.module.css';

export type RibbonTab =
  | 'file'
  | 'home'
  | 'insert'
  | 'page'
  | 'formula'
  | 'data'
  | 'review'
  | 'view';

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
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            className={`${styles.tab} ${tab === tabItem.id ? styles.tabActive : ''}`}
            onClick={() => setTab(tabItem.id)}
          >
            {tabItem.label}
          </button>
        ))}
      </div>
      {tab === 'home' ? (
        <div className={styles.ribbon}>
          <div className={styles.group}>
            <button type="button" className={styles.actionBtn} title="粘贴">
              <span className={styles.actionIcon}>📋</span>
              <span>粘贴</span>
            </button>
            <button type="button" className={styles.actionBtn} title="保存">
              <span className={styles.actionIcon}>💾</span>
              <span>保存</span>
            </button>
          </div>
          <div className={styles.groupDivider} />
          <div className={styles.group}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={styles.actionBtn}
                disabled={action.disabled}
                onClick={() => {
                  action.onClick?.();
                  onAction(action.id);
                }}
                title={action.label}
              >
                <span className={styles.actionIcon}>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.groupDivider} />
          <div className={styles.fontGroup}>
            <span className={styles.fontInput}>微软雅黑</span>
            <span className={styles.fontInput} style={{ minWidth: '24px' }}>11</span>
            <button type="button" className={styles.fmtBtn}>B</button>
            <button type="button" className={styles.fmtBtn}>I</button>
            <button type="button" className={styles.fmtBtn}>U</button>
          </div>
        </div>
      ) : (
        <div className={styles.ribbonPlaceholder}>
          {TABS.find((tabItem) => tabItem.id === tab)?.label} 功能区（演示）
        </div>
      )}
    </div>
  );
}
