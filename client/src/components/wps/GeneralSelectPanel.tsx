import { useEffect, useMemo, useState } from 'react';
import type { GeneralOption, Room } from '@tk/shared';
import styles from './GeneralSelectPanel.module.css';

interface GeneralSelectPanelProps {
  room: Room;
  playerId: string | null;
  onSelectGeneral: (generalId: string) => void;
}

function formatTime(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${min}:${String(rest).padStart(2, '0')}`;
}

function playerLabel(name?: string): string {
  if (!name) return '未知玩家';
  return name.endsWith('玩家') ? name : `${name}玩家`;
}

export function GeneralSelectPanel({ room, playerId, onSelectGeneral }: GeneralSelectPanelProps) {
  const selection = room.generalSelection;
  const options = selection?.myOptions ?? [];
  const hasSubmitted = !!selection?.selected.some((item) => item.playerId === playerId);
  const canChoose = !!selection && !hasSubmitted && options.length > 0;
  const [selectedId, setSelectedId] = useState<string>('');
  const [now, setNow] = useState(Date.now());
  const currentPlayer = room.players.find((player) => player.id === playerId);
  const lordPlayer = room.players.find((player) => player.role === '主公');
  const validationMessage =
    currentPlayer?.role && lordPlayer
      ? `你的身份是：${currentPlayer.role}，${playerLabel(lordPlayer.nickname)}是主公`
      : canChoose
        ? '请选择一项候选数据'
        : hasSubmitted
          ? '已提交，等待其他玩家'
          : '等待候选数据同步';

  useEffect(() => {
    setSelectedId('');
  }, [selection?.deadlineAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const selected = useMemo<GeneralOption | undefined>(
    () => options.find((item) => item.id === selectedId),
    [options, selectedId],
  );

  const selectedByPlayerId = useMemo(() => {
    const map = new Map<string, { generalId: string; generalName: string }>();
    for (const item of selection?.selected ?? []) {
      map.set(item.playerId, item);
    }
    return map;
  }, [selection?.selected]);

  if (!selection) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>数据验证</div>
          <div className={styles.subtitle}>{validationMessage}</div>
        </div>
        <div className={styles.timer}>{formatTime(selection.deadlineAt - now)}</div>
      </div>

      <div className={styles.content}>
        <section className={styles.options} aria-label="候选武将">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`${styles.option} ${selectedId === option.id ? styles.optionActive : ''}`}
                disabled={!canChoose}
                onClick={() => setSelectedId(option.id)}
              >
                <div className={styles.optionTop}>
                  <span className={styles.name}>{option.name}</span>
                  <span className={styles.hp}>{option.maxHp} 体力</span>
                </div>
                <div className={styles.skills}>
                  {option.skills.map((skill) => (
                    <div key={skill.name} className={styles.skill}>
                      <strong>{skill.name}</strong>
                      <span>{skill.description}</span>
                    </div>
                  ))}
                </div>
              </button>
            ))
          ) : (
            <div className={styles.waitingBox}>候选数据只对本人可见，提交后会自动刷新表格状态。</div>
          )}
        </section>

        <aside className={styles.summary}>
          <div className={styles.summaryTitle}>已选武将</div>
          {room.players.length === 0 ? (
            <div className={styles.empty}>暂无玩家</div>
          ) : (
            room.players.map((player) => {
              const picked = selectedByPlayerId.get(player.id);
              return (
                <div key={player.id} className={styles.selectedLine}>
                  <span className={styles.playerName}>
                    {player.nickname ?? '玩家'}
                    {player.role === '主公' ? <span className={styles.lordBadge}>主公</span> : null}
                  </span>
                  {picked ? (
                    <strong>{picked.generalName}</strong>
                  ) : (
                    <span className={styles.selecting}>正在选择</span>
                  )}
                </div>
              );
            })
          )}
        </aside>
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.confirm}
          disabled={!canChoose || !selected}
          onClick={() => {
            if (selected) onSelectGeneral(selected.id);
          }}
        >
          确认
        </button>
      </div>
    </div>
  );
}
