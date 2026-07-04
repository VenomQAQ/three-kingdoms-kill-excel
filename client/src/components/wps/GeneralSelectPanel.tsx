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

export function GeneralSelectPanel({ room, playerId, onSelectGeneral }: GeneralSelectPanelProps) {
  const selection = room.generalSelection;
  const options = selection?.myOptions ?? [];
  const isMyTurn = !!selection && selection.currentPlayerId === playerId && options.length > 0;
  const [selectedId, setSelectedId] = useState<string>('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setSelectedId('');
  }, [selection?.currentPlayerId, selection?.deadlineAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const selected = useMemo<GeneralOption | undefined>(
    () => options.find((item) => item.id === selectedId),
    [options, selectedId],
  );

  if (!selection) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>数据验证</div>
          <div className={styles.subtitle}>
            {isMyTurn ? '请选择一项候选数据' : `等待 ${selection.currentPlayerNickname} 选择`}
          </div>
        </div>
        <div className={styles.timer}>{formatTime(selection.deadlineAt - now)}</div>
      </div>

      <div className={styles.content}>
        <section className={styles.options} aria-label="候选武将">
          {isMyTurn ? (
            options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`${styles.option} ${selectedId === option.id ? styles.optionActive : ''}`}
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
            <div className={styles.waitingBox}>当前选择完成后会自动刷新表格状态。</div>
          )}
        </section>

        <aside className={styles.summary}>
          <div className={styles.summaryTitle}>已选武将</div>
          {selection.selected.length === 0 ? (
            <div className={styles.empty}>暂无选择</div>
          ) : (
            selection.selected.map((item) => {
              const player = room.players.find((p) => p.id === item.playerId);
              return (
                <div key={item.playerId} className={styles.selectedLine}>
                  <span>{player?.nickname ?? '玩家'}</span>
                  <strong>{item.generalName}</strong>
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
          disabled={!isMyTurn || !selected}
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
