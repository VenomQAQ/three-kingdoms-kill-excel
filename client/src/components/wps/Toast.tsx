import { useToastStore } from '../../store/toastStore';
import styles from './Toast.module.css';

export function Toast() {
  const message = useToastStore((s) => s.message);
  const hide = useToastStore((s) => s.hide);
  if (!message) return null;

  return (
    <div className={styles.wrap} role="status" onClick={hide}>
      {message}
    </div>
  );
}
