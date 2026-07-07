import type { MonopolyBoardCell } from '@tk/shared';
import { getCellTemplate } from '@tk/shared';
import styles from './SpreadsheetGrid.module.css';

export interface MonopolyCellLevelRent {
  level: number;
  rent: number;
  upgradeCost?: number;
}

export interface MonopolyCellDetailView {
  name: string;
  typeLabel: string;
  purchasePrice: number;
  levelRents: MonopolyCellLevelRent[];
  railRents?: number[];
  utilityRent?: number;
  ownerNickname?: string;
}

function cellTypeLabel(type: MonopolyBoardCell['type']): string {
  switch (type) {
    case 'city':
      return '城市地块';
    case 'rail':
      return '交通地块';
    case 'utility':
      return '公用设施';
    default:
      return '地块';
  }
}

export function buildMonopolyCellDetailView(
  cell: MonopolyBoardCell,
  ownerNickname?: string,
): MonopolyCellDetailView | null {
  const template = getCellTemplate(cell);
  if (!template) return null;

  if (template.kind === 'city') {
    return {
      name: cell.name,
      typeLabel: cellTypeLabel(cell.type),
      purchasePrice: template.purchasePrice,
      levelRents: template.levels.map((item) => ({
        level: item.level,
        rent: item.rent,
        upgradeCost: item.upgradeCost,
      })),
      ownerNickname,
    };
  }

  if (template.kind === 'rail') {
    return {
      name: cell.name,
      typeLabel: cellTypeLabel(cell.type),
      purchasePrice: template.purchasePrice,
      levelRents: [],
      railRents: template.rentsByOwnershipCount,
      ownerNickname,
    };
  }

  if (template.kind === 'utility') {
    return {
      name: cell.name,
      typeLabel: cellTypeLabel(cell.type),
      purchasePrice: template.purchasePrice,
      levelRents: [],
      utilityRent: template.baseRent,
      ownerNickname,
    };
  }

  return null;
}

interface MonopolyCellDetailModalProps {
  view: MonopolyCellDetailView | null;
  onClose: () => void;
}

export function MonopolyCellDetailModal({ view, onClose }: MonopolyCellDetailModalProps) {
  if (!view) return null;

  return (
    <div
      className={styles.monopolyDialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${view.name} 地块详情`}
      onClick={onClose}
    >
      <div className={styles.monopolyDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.monopolyDialogTitle}>{view.name}</div>
        <div className={styles.monopolyDialogBody}>
          <div>{view.typeLabel}</div>
          <div>购入价格：{view.purchasePrice}</div>
          {view.ownerNickname ? <div>归属：{view.ownerNickname}</div> : <div>归属：暂无</div>}
          {view.levelRents.length > 0 ? (
            <div className={styles.monopolyCellDetailLevels}>
              <div className={styles.monopolyCellDetailSectionTitle}>等级租金</div>
              {view.levelRents.map((item) => (
                <div key={item.level} className={styles.monopolyCellDetailLevelRow}>
                  <span>Lv.{item.level} 租金 {item.rent}</span>
                  {item.upgradeCost != null ? (
                    <span className={styles.monopolyCellDetailUpgrade}>升级费用 {item.upgradeCost}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {view.utilityRent != null ? <div>租金：{view.utilityRent}</div> : null}
          {view.railRents ? (
            <div className={styles.monopolyCellDetailLevels}>
              <div className={styles.monopolyCellDetailSectionTitle}>租金（按拥有数量）</div>
              {view.railRents.map((rent, index) => (
                <div key={index} className={styles.monopolyCellDetailLevelRow}>
                  拥有 {index + 1} 处：租金 {rent}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className={styles.monopolyDialogActions}>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
