import { useEffect } from 'react';
import styles from './BossKeyOverlay.module.css';

interface BossKeyOverlayProps {
  imageUrl: string;
}

export function BossKeyOverlay({ imageUrl }: BossKeyOverlayProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="老板键伪装">
      <img className={styles.image} src={imageUrl} alt="" draggable={false} />
    </div>
  );
}
