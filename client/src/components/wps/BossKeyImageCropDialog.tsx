import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatBossKeyTargetSize,
  getBossKeyTargetSize,
  type BossKeyTargetSize,
} from '../../utils/bossKeyImageSpec';
import {
  clampBossKeyCropView,
  getInitialBossKeyCropView,
  loadImageFromSource,
  renderBossKeyCroppedBlob,
  type BossKeyCropView,
} from '../../utils/bossKeyImageProcess';
import styles from './BossKeyImageCropDialog.module.css';

const PREVIEW_MAX_WIDTH = 560;

interface BossKeyImageCropDialogProps {
  open: boolean;
  imageUrl: string;
  targetSize?: BossKeyTargetSize;
  onConfirm: (blob: Blob, target: BossKeyTargetSize) => void;
  onCancel: () => void;
}

function getPreviewSize(target: BossKeyTargetSize): { width: number; height: number } {
  const width = Math.min(PREVIEW_MAX_WIDTH, target.width);
  const height = Math.round(width * (target.height / target.width));
  return { width, height };
}

export function BossKeyImageCropDialog({
  open,
  imageUrl,
  targetSize,
  onConfirm,
  onCancel,
}: BossKeyImageCropDialogProps) {
  const target = targetSize ?? getBossKeyTargetSize();
  const previewSize = useMemo(() => getPreviewSize(target), [target.width, target.height]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [cropView, setCropView] = useState<BossKeyCropView | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setImage(null);
      setCropView(null);
      setDragging(false);
      setSaving(false);
      return;
    }

    let cancelled = false;
    void loadImageFromSource(imageUrl).then((loaded) => {
      if (cancelled) return;
      setImage(loaded);
      setCropView(getInitialBossKeyCropView(loaded, previewSize.width, previewSize.height));
    });

    return () => {
      cancelled = true;
    };
  }, [open, imageUrl, previewSize.width, previewSize.height]);

  const updateCropView = useCallback(
    (updater: (current: BossKeyCropView) => BossKeyCropView) => {
      setCropView((current) => {
        if (!current || !image) return current;
        return clampBossKeyCropView(updater(current), image);
      });
    },
    [image],
  );

  const minScale = useMemo(() => {
    if (!image) return 1;
    return Math.max(previewSize.width / image.naturalWidth, previewSize.height / image.naturalHeight);
  }, [image, previewSize.height, previewSize.width]);

  const maxScale = minScale * 4;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropView) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: cropView.offsetX,
      offsetY: cropView.offsetY,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    updateCropView((current) => ({
      ...current,
      offsetX: start.offsetX + dx,
      offsetY: start.offsetY + dy,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    setDragging(false);
  };

  const handleZoomChange = (value: number) => {
    if (!image || !cropView) return;
    const nextScale = minScale + (maxScale - minScale) * value;
    const centerX = previewSize.width / 2;
    const centerY = previewSize.height / 2;
    const imageX = (centerX - cropView.offsetX) / cropView.scale;
    const imageY = (centerY - cropView.offsetY) / cropView.scale;
    const nextOffsetX = centerX - imageX * nextScale;
    const nextOffsetY = centerY - imageY * nextScale;
    updateCropView(() => ({
      ...cropView,
      scale: nextScale,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    }));
  };

  const zoomValue = cropView
    ? Math.min(1, Math.max(0, (cropView.scale - minScale) / (maxScale - minScale || 1)))
    : 0;

  const handleConfirm = async () => {
    if (!image || !cropView || saving) return;
    setSaving(true);
    try {
      const blob = await renderBossKeyCroppedBlob(image, cropView, target);
      onConfirm(blob, target);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>裁剪老板键图片</h2>
          <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.muted}>
            请拖动图片选择区域，裁剪后将输出为 {formatBossKeyTargetSize(target)}，与当前浏览器窗口一致，全屏铺满且不溢出。
          </p>
          <div
            className={`${styles.viewport} ${dragging ? styles.viewportDragging : ''}`}
            style={{ width: previewSize.width, height: previewSize.height }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {image && cropView && (
              <img
                className={styles.image}
                src={imageUrl}
                alt=""
                draggable={false}
                style={{
                  width: image.naturalWidth * cropView.scale,
                  height: image.naturalHeight * cropView.scale,
                  transform: `translate(${cropView.offsetX}px, ${cropView.offsetY}px)`,
                }}
              />
            )}
          </div>
          <div className={styles.controls}>
            <label>
              <span>缩放</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={zoomValue}
                disabled={!image || !cropView}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
              />
              <span>{Math.round(zoomValue * 100)}%</span>
            </label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onCancel}>
              取消
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!image || !cropView || saving}
              onClick={() => void handleConfirm()}
            >
              {saving ? '保存中…' : '确认裁剪并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
