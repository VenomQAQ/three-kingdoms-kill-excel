import { CardRegistry } from '@tk/engine';
import { stripGeneralPrefixInText } from '../../utils/display';
import styles from './GameModal.module.css';

interface CardDetailModalProps {
  cardName: string;
  onClose: () => void;
}

function slotLabel(subType?: string | null): string {
  switch (subType) {
    case 'weapon':
      return '武器';
    case 'armor':
      return '防具';
    case 'horse_plus':
      return '+1马';
    case 'horse_minus':
      return '-1马';
    default:
      return '装备';
  }
}

export function CardDetailModal({ cardName, onClose }: CardDetailModalProps) {
  const card = CardRegistry.getByName(cardName);
  if (!card) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="card-modal-title"
      >
        <header className={styles.header}>
          <h2 id="card-modal-title">{stripGeneralPrefixInText(card.name)}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </header>
        <div className={styles.body}>
          <dl className={styles.meta}>
            <dt>类型</dt>
            <dd>{slotLabel(card.subType)}</dd>
            <dt>卡牌名</dt>
            <dd>{stripGeneralPrefixInText(card.name)}</dd>
          </dl>
          <section className={styles.section}>
            <h3>说明</h3>
            <p>{stripGeneralPrefixInText(card.description)}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
