import type { GameType } from '@tk/shared';
import { useEffect, useState } from 'react';
import {
  bossKeyFromKeyboardEvent,
  formatBossKeyShortcut,
  type BossKeyShortcut,
} from '../../utils/bossKey';
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
  bossKeyShortcut: BossKeyShortcut;
  onBossKeyShortcutChange: (shortcut: BossKeyShortcut) => void;
  bgColorToken: string;
  onBgColorTokenChange: (token: string) => void;
  onChangeNickname?: () => void;
  onChangePassword?: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  defaultGameType,
  onDefaultGameTypeChange,
  bossKeyShortcut,
  onBossKeyShortcutChange,
  bgColorToken,
  onBgColorTokenChange,
  onChangeNickname,
  onChangePassword,
  onClose,
}: SettingsDialogProps) {
  const [title, setTitle] = useState('');
  const [recordingBossKey, setRecordingBossKey] = useState(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    setTitle(document.title);
    setRecordingBossKey(false);
  }, [open]);

  useEffect(() => {
    if (!open || !recordingBossKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = bossKeyFromKeyboardEvent(event);
      if (!shortcut) return;
      onBossKeyShortcutChange(shortcut);
      setRecordingBossKey(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, recordingBossKey, onBossKeyShortcutChange]);

  if (!open) return null;

  const saveTitle = () => {
    const next = title.trim().slice(0, 40) || DEFAULT_TITLE;
    document.title = next;
    window.localStorage.setItem('tk_browser_title', next);
    setTitle(next);
  };

  const previewBossTitle = () => {
    document.title = BOSS_TITLE;
    window.localStorage.setItem('tk_browser_title', BOSS_TITLE);
    setTitle(BOSS_TITLE);
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
          </section>
          <section className={modalStyles.section}>
            <h3>老板键</h3>
            <p className={modalStyles.muted}>按下快捷键后切换到「区域销售」Sheet，并同步伪装标题。</p>
            <div className={modalStyles.actions}>
              <button
                type="button"
                className={recordingBossKey ? modalStyles.primary : modalStyles.secondary}
                onClick={() => setRecordingBossKey(true)}
              >
                {recordingBossKey ? '请按下快捷键…' : `当前：${formatBossKeyShortcut(bossKeyShortcut)}`}
              </button>
              <button type="button" className={modalStyles.secondary} onClick={previewBossTitle}>
                预览伪装标题
              </button>
            </div>
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
