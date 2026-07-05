import type { GameType } from '@tk/shared';
import { useEffect, useState } from 'react';
import modalStyles from './GameModal.module.css';

interface SettingsDialogProps {
  open: boolean;
  defaultGameType: GameType;
  onDefaultGameTypeChange: (type: GameType) => void;
  onChangeNickname?: () => void;
  onChangePassword?: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  defaultGameType,
  onDefaultGameTypeChange,
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
    const next = title.trim().slice(0, 40) || '三国杀表格.xlsx';
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
