import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { HttpError } from '../../api';
import { translateError } from '../../data/errorMessages';
import { useAppStore } from '../../store/appStore';
import styles from './LoginDialog.module.css';

const QQ_EMAIL_RE = /^\d{5,11}@qq\.com$/i;

type Tab = 'login' | 'register';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) emailRef.current?.focus();
  }, [open, tab]);

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

  const checkEmail = useCallback((value: string) => {
    if (!value.trim()) {
      setEmailHint(null);
      return;
    }
    setEmailHint(QQ_EMAIL_RE.test(value.trim()) ? null : '请使用 QQ 邮箱（数字@qq.com）');
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        if (password !== confirmPassword) {
          setError('两次密码不一致');
          setLoading(false);
          return;
        }
        await register(email.trim(), password, nickname.trim() || '表格用户', confirmPassword);
      }
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
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="登录">
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>数据校验</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('register');
              setError(null);
            }}
          >
            注册
          </button>
        </div>
        <form className={styles.body} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>邮箱</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                checkEmail(e.target.value);
              }}
              required
            />
          </label>
          {emailHint && <p className={styles.hint}>{emailHint}</p>}
          <label className={styles.field}>
            <span>密码</span>
            <input
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={32}
            />
          </label>
          {tab === 'register' && (
            <>
              <label className={styles.field}>
                <span>确认密码</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={32}
                />
              </label>
              <label className={styles.field}>
                <span>昵称</span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={12}
                  placeholder="表格用户"
                />
              </label>
            </>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? '提交中…' : tab === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
