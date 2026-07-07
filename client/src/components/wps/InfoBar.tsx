import { useEffect, useRef, useState } from 'react';
import styles from './InfoBar.module.css';

interface InfoBarProps {
  nickname: string;
  connected: boolean;
  accountLabel?: string;
  roomCode?: string;
  roomStatus?: string;
  actingName?: string;
  turnName?: string;
  isAuthed?: boolean;
  onLoginClick?: () => void;
  onProfileClick?: () => void;
  onChangeNickname?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
}

export function InfoBar({
  nickname,
  connected,
  accountLabel,
  roomCode,
  roomStatus,
  actingName,
  turnName,
  isAuthed,
  onLoginClick,
  onProfileClick,
  onChangeNickname,
  onChangePassword,
  onLogout,
}: InfoBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div className={styles.bar}>
      {isAuthed ? (
        <span className={styles.authWrap} ref={wrapRef}>
          <button
            type="button"
            className={styles.emailBtn}
            onClick={() => onProfileClick?.()}
          >
            {accountLabel ?? nickname}
          </button>
          {/* <button
            type="button"
            className={styles.authBtn}
            onClick={() => setMenuOpen((v) => !v)}
          >
            账户
          </button> */}
          {menuOpen && (
            <div className={styles.dropdown} role="menu">
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onChangeNickname?.();
                }}
              >
                修改昵称
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onChangePassword?.();
                }}
              >
                修改密码
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onLogout?.();
                }}
              >
                登出
              </button>
            </div>
          )}
        </span>
      ) : (
        <span className={styles.authWrap}>
          <strong>未登录</strong>
          <button type="button" className={styles.authBtn} onClick={onLoginClick}>
            登录
          </button>
        </span>
      )}
      <span className={styles.sep}>|</span>
      <span>
        当前状态{' '}
        <strong className={connected ? styles.ok : styles.err}>
          {connected ? '在线' : '离线'}
        </strong>
      </span>
      {roomCode && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            房间 <strong className={styles.highlight}>{roomCode}</strong>
          </span>
          <span className={styles.sep}>|</span>
          <span>
            状态 <strong>{roomStatus ?? '—'}</strong>
          </span>
        </>
      )}
      {actingName && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            当前操控 <strong className={styles.highlight}>{actingName}</strong>
          </span>
        </>
      )}
      {turnName && (
        <>
          <span className={styles.sep}>|</span>
          <span>
            回合 <strong>{turnName}</strong>
          </span>
        </>
      )}
    </div>
  );
}
