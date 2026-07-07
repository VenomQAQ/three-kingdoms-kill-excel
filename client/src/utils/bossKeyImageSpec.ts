export interface BossKeyTargetSize {
  width: number;
  height: number;
}

export function getBossKeyTargetSize(): BossKeyTargetSize {
  if (typeof window === 'undefined') return { width: 1920, height: 1080 };
  return {
    width: Math.max(1, Math.round(window.innerWidth)),
    height: Math.max(1, Math.round(window.innerHeight)),
  };
}

export function formatBossKeyTargetSize(size: BossKeyTargetSize): string {
  return `${size.width} × ${size.height}`;
}

export function getBossKeyTargetAspect(size: BossKeyTargetSize = getBossKeyTargetSize()): number {
  return size.width / size.height;
}

export function imageMatchesBossKeyTarget(
  imageWidth: number,
  imageHeight: number,
  target: BossKeyTargetSize = getBossKeyTargetSize(),
): boolean {
  return imageWidth === target.width && imageHeight === target.height;
}

export function storedImageMatchesViewport(
  stored: BossKeyTargetSize | null | undefined,
  target: BossKeyTargetSize = getBossKeyTargetSize(),
): boolean {
  if (!stored) return false;
  return stored.width === target.width && stored.height === target.height;
}
