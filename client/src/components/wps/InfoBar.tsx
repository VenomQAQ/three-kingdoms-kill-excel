import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../../store/appStore';
import styles from './InfoBar.module.css';

interface InfoBarProps {
  nickname: string;
  connectionStatus: ConnectionStatus;
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
  connectionStatus,
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

  const statusLabel =
    connectionStatus === 'online'
      ? '在线'
      : connectionStatus === 'connecting'
        ? '连接中'
        : '离线';
  const statusClass =
    connectionStatus === 'online'
      ? styles.ok
      : connectionStatus === 'connecting'
        ? styles.pending
        : styles.err;

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
        <strong className={statusClass}>
          {statusLabel}
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
            当前回合 <strong>{turnName}</strong>
          </span>
        </>
      )}
    </div>
  );
}
