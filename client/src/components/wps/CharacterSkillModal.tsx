import { CharacterRegistry } from '@tk/engine';
import type { RoomPlayer } from '@tk/shared';
import styles from './GameModal.module.css';

interface CharacterSkillModalProps {
  player: RoomPlayer;
  onClose: () => void;
}

export function CharacterSkillModal({ player, onClose }: CharacterSkillModalProps) {
  const ch = CharacterRegistry.resolve(player.general ?? player.nickname);
  const role = player.role ?? '—';
  const hp = player.hp ?? 0;
  const max = player.maxHp ?? 0;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="char-modal-title"
      >
        <header className={styles.header}>
          <h2 id="char-modal-title">{ch?.name ?? player.general ?? player.nickname}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </header>
        <div className={styles.body}>
          <dl className={styles.meta}>
            <dt>操控名</dt>
            <dd>{player.nickname}</dd>
            <dt>身份</dt>
            <dd>【{role}】</dd>
            <dt>势力</dt>
            <dd>{ch?.kingdom === 'wei' ? '魏' : ch?.kingdom === 'shu' ? '蜀' : ch?.kingdom === 'wu' ? '吴' : ch?.kingdom === 'qun' ? '群' : '—'}</dd>
            <dt>体力</dt>
            <dd>
              {hp}/{max}
            </dd>
            <dt>装备</dt>
            <dd>{(player.equipment ?? []).join('、') || '无'}</dd>
            <dt>判定区</dt>
            <dd>{(player.judgeCards ?? []).join('、') || '无'}</dd>
          </dl>
          <section className={styles.section}>
            <h3>技能</h3>
            {ch?.skills.length ? (
              <ul className={styles.skillList}>
                {ch.skills.map((s) => (
                  <li key={s.id}>
                    <strong>
                      {s.name}
                      {s.type === 'lord' ? '【主公技】' : s.type === 'locked' ? '【锁定技】' : ''}
                    </strong>
                    <p>{s.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>暂无配置技能（可在引擎 characters 中扩展）</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
