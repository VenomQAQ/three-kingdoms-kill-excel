import type { BossKeyTargetSize } from './bossKeyImageSpec';

export interface BossKeyCropView {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

export async function getImageSizeFromFile(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageFromSource(url);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function getInitialBossKeyCropView(
  image: HTMLImageElement,
  viewportWidth: number,
  viewportHeight: number,
): BossKeyCropView {
  const scale = Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight);
  const displayW = image.naturalWidth * scale;
  const displayH = image.naturalHeight * scale;
  return {
    scale,
    offsetX: (viewportWidth - displayW) / 2,
    offsetY: (viewportHeight - displayH) / 2,
    viewportWidth,
    viewportHeight,
  };
}

export function clampBossKeyCropView(view: BossKeyCropView, image: HTMLImageElement): BossKeyCropView {
  const displayW = image.naturalWidth * view.scale;
  const displayH = image.naturalHeight * view.scale;
  const minX = Math.min(0, view.viewportWidth - displayW);
  const minY = Math.min(0, view.viewportHeight - displayH);
  const maxX = 0;
  const maxY = 0;
  return {
    ...view,
    offsetX: Math.min(maxX, Math.max(minX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(minY, view.offsetY)),
  };
}

export function renderBossKeyCroppedBlob(
  image: HTMLImageElement,
  view: BossKeyCropView,
  target: BossKeyTargetSize,
): Promise<Blob> {
  const clamped = clampBossKeyCropView(view, image);
  const sx = -clamped.offsetX / clamped.scale;
  const sy = -clamped.offsetY / clamped.scale;
  const sw = clamped.viewportWidth / clamped.scale;
  const sh = clamped.viewportHeight / clamped.scale;

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('无法创建画布'));

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, target.width, target.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('图片导出失败'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.92,
    );
  });
}
