/**
 * Download and persist the offline translation pack.
 *
 * Fetches from `/offline/` (produced by scripts/build-offline.mjs) and stores
 * everything in IndexedDB via storage.ts.
 *
 * Both the UI and the service worker can call downloadPack().
 */
import {
  setDict,
  setReverse,
  setAudio,
  setMeta,
  getMeta,
  clearAll,
  type OfflineMeta,
} from './storage';
import { md5 } from './md5';

export interface DownloadProgress {
  phase: 'checking' | 'dictionaries' | 'audio' | 'done' | 'error';
  current: number;
  total: number;
  bytesLoaded: number;
  bytesTotal: number;
  message: string;
}

export interface DownloadOptions {
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  force?: boolean; // re-download even if version matches
}

export interface Manifest {
  version: string;
  generated_at: string;
  languages: string[];
  voice_languages: string[];
  voice: {
    totalFiles: number;
    totalBytes: number;
    perLangCounts: Record<string, number>;
  };
}

const OFFLINE_BASE = '/offline';

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

/**
 * Check the manifest on the server against what's installed locally.
 * Returns true if a download is needed.
 */
export async function needsUpdate(): Promise<boolean> {
  try {
    const remote = await fetchJson<Manifest>(`${OFFLINE_BASE}/manifest.json`);
    const local = await getMeta();
    if (!local) return true;
    return local.version !== remote.version;
  } catch {
    return false; // offline: can't check, assume up to date
  }
}

/**
 * Download the offline pack into IndexedDB.
 * Safe to call multiple times. Aborts cleanly via `signal`.
 */
export async function downloadPack(opts: DownloadOptions = {}): Promise<OfflineMeta> {
  const { onProgress, signal, force } = opts;
  const report = (p: Partial<DownloadProgress>) =>
    onProgress?.({
      phase: 'checking',
      current: 0,
      total: 0,
      bytesLoaded: 0,
      bytesTotal: 0,
      message: '',
      ...p,
    });

  report({ phase: 'checking', message: 'Checking for updates…' });

  const manifest = await fetchJson<Manifest>(`${OFFLINE_BASE}/manifest.json`, signal);

  if (!force) {
    const local = await getMeta();
    if (local && local.version === manifest.version) {
      report({ phase: 'done', message: 'Already up to date' });
      return local;
    }
  }

  // Wipe old data — a partial pack is worse than nothing
  await clearAll();

  // ---- Dictionaries ----
  report({ phase: 'dictionaries', message: 'Downloading dictionaries…' });

  const dicts: Record<string, Record<string, string>> = {};
  let dictBytes = 0;
  let reverseBytes = 0;

  for (let i = 0; i < manifest.languages.length; i++) {
    const lang = manifest.languages[i];
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const url = `${OFFLINE_BASE}/${lang}.json`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
    const text = await r.text();
    dictBytes += text.length;
    const data = JSON.parse(text) as Record<string, string>;
    dicts[lang] = data;
    await setDict(lang, data);
    report({
      phase: 'dictionaries',
      current: i + 1,
      total: manifest.languages.length,
      bytesLoaded: dictBytes,
      bytesTotal: dictBytes,
      message: `Dictionaries: ${lang}`,
    });
  }

  // Reverse index (single file for all languages)
  const reverseUrl = `${OFFLINE_BASE}/reverse.json`;
  const reverseResp = await fetch(reverseUrl, { signal });
  if (!reverseResp.ok) throw new Error(`GET ${reverseUrl} → ${reverseResp.status}`);
  const reverseText = await reverseResp.text();
  reverseBytes = reverseText.length;
  const reverseData = JSON.parse(reverseText) as Record<string, Record<string, string>>;
  for (const [lang, map] of Object.entries(reverseData)) {
    await setReverse(lang, map);
  }

  // ---- Audio ----
  report({ phase: 'audio', message: 'Downloading voice cache…' });

  let audioFiles = 0;
  let audioBytes = 0;
  const audioCounts: Record<string, number> = {};

  for (const lang of manifest.voice_languages) {
    audioCounts[lang] = 0;
    const dict = dicts[lang] || {};
    const targets = new Set(Object.values(dict));
    const triedHashes = new Set<string>();

    for (const target of targets) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const hash = md5(String(target).trim()).slice(0, 16);
      if (triedHashes.has(hash)) continue;
      triedHashes.add(hash);

      const url = `${OFFLINE_BASE}/voice/${lang}/${hash}.mp3`;
      try {
        const r = await fetch(url, { signal });
        if (!r.ok) continue; // no audio for this phrase — skip
        const blob = await r.blob();
        await setAudio(lang, hash, blob);
        audioFiles++;
        audioBytes += blob.size;
        audioCounts[lang]++;
        report({
          phase: 'audio',
          current: audioFiles,
          total: manifest.voice.totalFiles,
          bytesLoaded: audioBytes,
          bytesTotal: manifest.voice.totalBytes,
          message: `Voice: ${lang} (${audioFiles}/${manifest.voice.totalFiles})`,
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        // network hiccup on one file: skip and continue
      }
    }
  }

  const meta: OfflineMeta = {
    version: manifest.version,
    downloadedAt: Date.now(),
    languages: manifest.languages,
    voice_languages: manifest.voice_languages,
    dict_bytes: dictBytes + reverseBytes,
    audio_bytes: audioBytes,
    dict_counts: Object.fromEntries(
      manifest.languages.map((l) => [l, Object.keys(dicts[l] || {}).length]),
    ),
    audio_counts: audioCounts,
  };
  await setMeta(meta);

  report({
    phase: 'done',
    current: audioFiles,
    total: audioFiles,
    bytesLoaded: meta.dict_bytes + meta.audio_bytes,
    bytesTotal: meta.dict_bytes + meta.audio_bytes,
    message: `Done — ${audioFiles} voice files, ${(meta.audio_bytes / 1024 / 1024).toFixed(1)} MB`,
  });

  return meta;
}