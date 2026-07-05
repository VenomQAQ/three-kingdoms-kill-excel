import { useEffect, useState } from 'react';
import type { PlayerPublicProfile } from '@tk/shared';
import { ProfileApi } from '../../api';
import modalStyles from './GameModal.module.css';

interface PlayerProfileModalProps {
  userId: string | null;
  virtualName?: string;
  onClose: () => void;
}

export function PlayerProfileModal({ userId, virtualName, onClose }: PlayerProfileModalProps) {
  const [profile, setProfile] = useState<PlayerPublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }
    let alive = true;
    setProfile(null);
    setError(null);
    void ProfileApi.getPublicProfile(userId)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '资料加载失败');
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true">
      <div className={modalStyles.panel}>
        <div className={modalStyles.header}>
          <h2>玩家资料</h2>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={modalStyles.body}>
          {!userId ? (
            <>
              <p className={modalStyles.inlineMeta}>{virtualName ?? '虚拟角色'}</p>
              <p className={modalStyles.muted}>虚拟角色没有绑定账号资料。</p>
            </>
          ) : null}
          {error ? <p className={modalStyles.message}>{error}</p> : null}
          {userId && !profile && !error ? <p className={modalStyles.muted}>正在读取资料...</p> : null}
          {profile ? (
            <>
              <dl className={modalStyles.meta}>
                <dt>昵称</dt>
                <dd>{profile.nickname}</dd>
                <dt>等级</dt>
                <dd>Lv.{profile.level}</dd>
                <dt>金币</dt>
                <dd>{profile.coins}</dd>
              </dl>
              <section className={modalStyles.section}>
                <h3>战绩</h3>
                <dl className={modalStyles.meta}>
                  <dt>总局数</dt>
                  <dd>{profile.stats.total}</dd>
                  <dt>胜利</dt>
                  <dd>{profile.stats.wins}</dd>
                  <dt>失败</dt>
                  <dd>{profile.stats.losses}</dd>
                  <dt>胜率</dt>
                  <dd>{Math.round(profile.stats.winRate * 100)}%</dd>
                  <dt>最近更新</dt>
                  <dd>{new Date(profile.updatedAt).toLocaleString()}</dd>
                </dl>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
