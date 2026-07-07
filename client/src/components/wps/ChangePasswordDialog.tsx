import { FormEvent, useEffect, useRef, useState } from 'react';
import { HttpError } from '../../api';
import { translateError } from '../../data/errorMessages';
import { useAppStore } from '../../store/appStore';
import { useToastStore } from '../../store/toastStore';
import modalStyles from './GameModal.module.css';

const QQ_EMAIL_RE = /^[1-9]\d{4,10}@qq\.com$/i;

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ChangePasswordDialog({ open, onClose, onSuccess }: ChangePasswordDialogProps) {
  const changePassword = useAppStore((s) => s.changePassword);
  const userEmail = useAppStore((s) => s.user?.email ?? '');
  const showToast = useToastStore((s) => s.show);
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setEmail(userEmail);
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    setError(null);
    emailRef.current?.focus();
  }, [open, userEmail]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const accountEmail = userEmail.trim().toLowerCase();

    if (!QQ_EMAIL_RE.test(normalizedEmail)) {
      setError('请输入有效的 QQ 邮箱');
      return;
    }
    if (normalizedEmail !== accountEmail) {
      setError('QQ 邮箱与当前登录账号不一致');
      return;
    }
    if (!oldPassword) {
      setError('请输入旧密码');
      return;
    }
    if (newPassword !== confirm) {
      setError(translateError('E_PASSWORD_MISMATCH'));
      return;
    }

    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      showToast('修改成功，请重新登录');
      onSuccess();
      onClose();
    } catch (err) {
      const code = err instanceof HttpError ? err.code : undefined;
      setError(translateError(code, err instanceof Error ? err.message : '发生了错误'));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true">
      <div className={modalStyles.panel}>
        <div className={modalStyles.header}>
          <h2>修改密码</h2>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        <form className={modalStyles.body} onSubmit={handleSubmit}>
          <label className={modalStyles.fieldLabel}>
            QQ 邮箱
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={modalStyles.fieldLabel}>
            旧密码
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </label>
          <label className={modalStyles.fieldLabel}>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              maxLength={32}
            />
          </label>
          <label className={modalStyles.fieldLabel}>
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              maxLength={32}
            />
          </label>
          {error && <p className={modalStyles.message}>{error}</p>}
          <div className={modalStyles.actions}>
            <button type="button" className={modalStyles.secondary} onClick={onClose}>
              取消
            </button>
            <button type="submit" className={modalStyles.primary} disabled={loading}>
              {loading ? '提交中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
