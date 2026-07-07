import type { MonopolyBoardCell, MonopolyPlayerState } from '@tk/shared';
import { resolveCellRent } from '@tk/shared';
import modalStyles from './GameModal.module.css';

export interface MonopolyPlayerAssetsView {
  player: MonopolyPlayerState;
  connected: boolean;
  properties: Array<{
    name: string;
    level: number;
    rent: number;
  }>;
}

interface MonopolyPlayerAssetsModalProps {
  view: MonopolyPlayerAssetsView | null;
  board: MonopolyBoardCell[];
  onClose: () => void;
}

export function buildMonopolyPlayerAssetsView(
  player: MonopolyPlayerState,
  board: MonopolyBoardCell[],
  connected: boolean,
): MonopolyPlayerAssetsView {
  const properties = player.properties
    .map((index) => {
      const cell = board[index];
      if (!cell) return null;
      return {
        name: cell.name,
        level: cell.level ?? 1,
        rent: resolveCellRent(cell, { board, ownerId: player.playerId }),
      };
    })
    .filter((item): item is { name: string; level: number; rent: number } => item != null);

  return { player, connected, properties };
}

export function MonopolyPlayerAssetsModal({ view, onClose }: MonopolyPlayerAssetsModalProps) {
  if (!view) return null;

  const { player, connected, properties } = view;
  const positionLabel = player.bankrupt ? '破产' : '正常';

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={modalStyles.panel} onClick={(event) => event.stopPropagation()}>
        <div className={modalStyles.header}>
          <h2>
            <span
              className={connected ? modalStyles.statusDotOnline : modalStyles.statusDotOffline}
              aria-hidden="true"
            />
            {player.nickname}
          </h2>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={modalStyles.body}>
          <dl className={modalStyles.meta}>
            <dt>现金</dt>
            <dd>{player.cash}</dd>
            <dt>状态</dt>
            <dd>{positionLabel}</dd>
            <dt>在线</dt>
            <dd>{connected ? '是' : '否'}</dd>
          </dl>
          <section className={modalStyles.section}>
            <h3>持有地块</h3>
            {properties.length > 0 ? (
              <ul className={modalStyles.list}>
                {properties.map((item) => (
                  <li key={item.name}>
                    {item.name} · Lv.{item.level} · 租金 {item.rent}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={modalStyles.muted}>暂无持有地块</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
