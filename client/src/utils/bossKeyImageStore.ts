import type { BossKeyTargetSize } from './bossKeyImageSpec';

const DB_NAME = 'tk-boss-key';
const STORE_NAME = 'images';
const IMAGE_KEY = 'cover';
const META_KEY = 'cover-meta';
const DB_VERSION = 1;

/** 单张图片上限，IndexedDB 容量远大于 localStorage，此处仅防误传超大文件 */
export const BOSS_KEY_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface BossKeyImageMeta extends BossKeyTargetSize {
  mimeType: string;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
}

export async function saveBossKeyImage(file: Blob, meta: BossKeyImageMeta): Promise<void> {
  if (file.size > BOSS_KEY_IMAGE_MAX_BYTES) {
    throw new Error(`图片不能超过 ${Math.round(BOSS_KEY_IMAGE_MAX_BYTES / 1024 / 1024)}MB`);
  }
  await runTransaction('readwrite', (store) => {
    store.put(file, IMAGE_KEY);
    return store.put(meta, META_KEY);
  });
}

export async function loadBossKeyImageBlob(): Promise<Blob | null> {
  const result = await runTransaction<Blob | undefined>('readonly', (store) => store.get(IMAGE_KEY));
  return result ?? null;
}

export async function loadBossKeyImageMeta(): Promise<BossKeyImageMeta | null> {
  const result = await runTransaction<BossKeyImageMeta | undefined>('readonly', (store) =>
    store.get(META_KEY),
  );
  if (!result || typeof result.width !== 'number' || typeof result.height !== 'number') return null;
  return result;
}

export async function hasBossKeyImage(): Promise<boolean> {
  const blob = await loadBossKeyImageBlob();
  return !!blob && blob.size > 0;
}

export async function clearBossKeyImage(): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.delete(IMAGE_KEY);
    return store.delete(META_KEY);
  });
}

export async function loadBossKeyImageObjectUrl(): Promise<string | null> {
  const blob = await loadBossKeyImageBlob();
  if (!blob || blob.size === 0) return null;
  return URL.createObjectURL(blob);
}
