import type { GameType } from '@tk/shared';
import { useEffect, useState } from 'react';
import modalStyles from './GameModal.module.css';

const DEFAULT_TITLE = '三国杀表格.xlsx';
const BOSS_TITLE = '第 1 季度区域销售汇总.xlsx';
const BG_COLOR_OPTIONS = [
  { value: '#ffffff', label: '纯白' },
  { value: '#f7f3ea', label: '米白' },
  { value: '#eef6ff', label: '浅蓝' },
  { value: '#f6f6f6', label: '浅灰' },
] as const;

interface SettingsDialogProps {
  open: boolean;
  defaultGameType: GameType;
  onDefaultGameTypeChange: (type: GameType) => void;
  bossMode: boolean;
  onBossModeChange: (enabled: boolean) => void;
  bgColorToken: string;
  onBgColorTokenChange: (token: string) => void;
  showMonopolyCellColors: boolean;
  onShowMonopolyCellColorsChange: (enabled: boolean) => void;
  onChangeNickname?: () => void;
  onChangePassword?: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  defaultGameType,
  onDefaultGameTypeChange,
  bossMode,
  onBossModeChange,
  bgColorToken,
  onBgColorTokenChange,
  showMonopolyCellColors,
  onShowMonopolyCellColorsChange,
  onChangeNickname,
  onChangePassword,
  onClose,
}: SettingsDialogProps) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    setTitle(document.title);
  }, [open]);

  if (!open) return null;

  const saveTitle = () => {
    const next = title.trim().slice(0, 40) || DEFAULT_TITLE;
    document.title = next;
    window.localStorage.setItem('tk_browser_title', next);
    setTitle(next);
  };

  const handleBossModeToggle = (enabled: boolean) => {
    onBossModeChange(enabled);
    const next = enabled ? BOSS_TITLE : DEFAULT_TITLE;
    document.title = next;
    window.localStorage.setItem('tk_browser_title', next);
    setTitle(next);
  };

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true">
      <div className={modalStyles.panel}>
        <div className={modalStyles.header}>
          <h2>表格设置</h2>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={modalStyles.body}>
          <section className={modalStyles.section}>
            <h3>默认创建游戏</h3>
            <div className={modalStyles.segmented} role="group" aria-label="默认创建游戏">
              <button
                type="button"
                className={defaultGameType === 'sanguosha' ? modalStyles.segmentActive : ''}
                onClick={() => onDefaultGameTypeChange('sanguosha')}
              >
                三国杀
              </button>
              <button
                type="button"
                className={defaultGameType === 'monopoly' ? modalStyles.segmentActive : ''}
                onClick={() => onDefaultGameTypeChange('monopoly')}
              >
                大富翁
              </button>
            </div>
            <p className={modalStyles.muted}>功能区里的“创建房间”会使用这里选择的游戏。</p>
          </section>
          <section className={modalStyles.section}>
            <h3>外观</h3>
            <div className={modalStyles.segmented} role="group" aria-label="老板键">
              <button
                type="button"
                className={!bossMode ? modalStyles.segmentActive : ''}
                onClick={() => handleBossModeToggle(false)}
              >
                常规模式
              </button>
              <button
                type="button"
                className={bossMode ? modalStyles.segmentActive : ''}
                onClick={() => handleBossModeToggle(true)}
              >
                老板键
              </button>
            </div>
            <p className={modalStyles.muted}>开启后会切到伪装表格视图，并同步更新标签页标题。</p>
            <label className={modalStyles.fieldLabel}>
              背景色
              <select
                className={modalStyles.select}
                value={bgColorToken}
                onChange={(event) => onBgColorTokenChange(event.target.value)}
              >
                {BG_COLOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={modalStyles.segmented} role="group" aria-label="地块颜色显示">
              <button
                type="button"
                className={!showMonopolyCellColors ? modalStyles.segmentActive : ''}
                onClick={() => onShowMonopolyCellColorsChange(false)}
              >
                隐藏地块颜色
              </button>
              <button
                type="button"
                className={showMonopolyCellColors ? modalStyles.segmentActive : ''}
                onClick={() => onShowMonopolyCellColorsChange(true)}
              >
                显示地块颜色
              </button>
            </div>
            <p className={modalStyles.muted}>默认关闭，避免大富翁地图颜色过于显眼。</p>
          </section>
          <section className={modalStyles.section}>
            <h3>账户</h3>
            <div className={modalStyles.actions}>
              <button type="button" className={modalStyles.secondary} onClick={onChangeNickname}>
                修改昵称
              </button>
              <button type="button" className={modalStyles.secondary} onClick={onChangePassword}>
                修改密码
              </button>
            </div>
          </section>
          <section className={modalStyles.section}>
            <h3>浏览器标签页标题</h3>
            <label className={modalStyles.fieldLabel}>
              标题
              <input
                className={modalStyles.textInput}
                value={title}
                maxLength={40}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className={modalStyles.actions}>
              <button type="button" className={modalStyles.primary} onClick={saveTitle}>
                保存标题
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
