/**
 * IndexedDB wrapper for the offline translation pack.
 *
 * Stores:
 *   - dict/{lang}       JSON map {source: target} per language
 *   - reverse/{lang}    JSON map {target: source}
 *   - audio/{lang}/{hash}  Blob (MP3)
 *   - meta              {version, downloadedAt, ...}
 *
 * Both the main thread (src/offline/translator.ts) and the service worker
 * (src/service-worker.ts) import from here. IndexedDB is shared per-origin,
 * so writes from one are visible to the other.
 *
 * No React, no fetch. Pure IndexedDB.
 */

const DB_NAME = 'lingolink-offline';
const DB_VERSION = 1;

export interface OfflineMeta {
  version: string;
  downloadedAt: number;
  languages: string[];
  voice_languages: string[];
  dict_bytes: number;
  audio_bytes: number;
  dict_counts: Record<string, number>;
  audio_counts: Record<string, number>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('dict')) {
        db.createObjectStore('dict');
      }
      if (!db.objectStoreNames.contains('reverse')) {
        db.createObjectStore('reverse');
      }
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---- Meta ----

export async function getMeta(): Promise<OfflineMeta | null> {
  const m = await tx<OfflineMeta | undefined>('meta', 'readonly', (s) => s.get('meta'));
  return m ?? null;
}

export async function setMeta(meta: OfflineMeta): Promise<void> {
  await tx('meta', 'readwrite', (s) => s.put(meta, 'meta'));
}

// ---- Dictionaries ----

export async function getDict(lang: string): Promise<Record<string, string> | null> {
  const d = await tx<Record<string, string> | undefined>('dict', 'readonly', (s) => s.get(lang));
  return d ?? null;
}

export async function setDict(lang: string, data: Record<string, string>): Promise<void> {
  await tx('dict', 'readwrite', (s) => s.put(data, lang));
}

export async function getReverse(lang: string): Promise<Record<string, string> | null> {
  const d = await tx<Record<string, string> | undefined>('reverse', 'readonly', (s) => s.get(lang));
  return d ?? null;
}

export async function setReverse(lang: string, data: Record<string, string>): Promise<void> {
  await tx('reverse', 'readwrite', (s) => s.put(data, lang));
}

// ---- Audio ----

function audioKey(lang: string, hash: string): string {
  return `${lang}/${hash}`;
}

export async function getAudio(lang: string, hash: string): Promise<Blob | null> {
  const b = await tx<Blob | undefined>('audio', 'readonly', (s) => s.get(audioKey(lang, hash)));
  return b ?? null;
}

export async function setAudio(lang: string, hash: string, blob: Blob): Promise<void> {
  await tx('audio', 'readwrite', (s) => s.put(blob, audioKey(lang, hash)));
}

// ---- Bulk / maintenance ----

export async function clearAll(): Promise<void> {
  await Promise.all(
    ['dict', 'reverse', 'audio', 'meta'].map((store) =>
      tx(store, 'readwrite', (s) => s.clear()),
    ),
  );
}

export async function isPackInstalled(minVersion?: string): Promise<boolean> {
  const meta = await getMeta();
  if (!meta) return false;
  if (minVersion && meta.version < minVersion) return false;
  return true;
}

/**
 * Estimate how many bytes the offline pack is using.
 * Uses navigator.storage.estimate() when available; falls back to meta.
 */
export async function usageBytes(): Promise<number> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && est.usage) return est.usage;
  } catch {
    // ignore
  }
  const meta = await getMeta();
  return meta ? meta.dict_bytes + meta.audio_bytes : 0;
}