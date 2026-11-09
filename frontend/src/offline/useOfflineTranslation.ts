/**
 * React hook for offline translation.
 *
 * Usage:
 *   const { isReady, progress, download, translate } = useOfflineTranslation();
 *
 *   // Download the pack
 *   await download();
 *
 *   // Translate (offline-first, falls back to online API if not found)
 *   const result = await translate('hello', 'english', 'luganda');
 *
 * The hook is singleton-safe: calling it from multiple components shares
 * the same state via a module-level store.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  downloadPack,
  needsUpdate,
  type DownloadProgress,
  type Manifest,
} from './sync';
import {
  offlineTranslate,
  isOfflineReady,
  getOfflineLanguages,
  getAudioStats,
  type OfflineResult,
} from './translator';
import { getMeta, usageBytes, clearAll, type OfflineMeta } from './storage';

// ---------------------------------------------------------------------------
// Shared state (singleton across components)
// ---------------------------------------------------------------------------
type Store = {
  isReady: boolean;
  meta: OfflineMeta | null;
  usageBytes: number;
  progress: DownloadProgress | null;
  downloading: boolean;
  error: string | null;
  browserOffline: boolean;
  abortController: AbortController | null;
};

const store: Store = {
  isReady: false,
  meta: null,
  usageBytes: 0,
  progress: null,
  downloading: false,
  error: null,
  browserOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  abortController: null,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Backend API base — reads the same env var your app already uses
// ---------------------------------------------------------------------------
const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.VITE_API_BASE ||
  'http://localhost:8000';

interface OnlineResult {
  translated_text: string;
  source_language?: string;
  target_language?: string;
}

async function onlineTranslate(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  try {
    const resp = await fetch(`${API_BASE}/translate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_language: from === 'auto' ? 'auto' : from,
        target_language: to,
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as OnlineResult;
    return data.translated_text || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useOfflineTranslation() {
  const [state, setState] = useState(() => ({ ...store }));

  // Sync component state with store
  useEffect(() => {
    const update = () => setState({ ...store });
    const unsub = subscribe(update);
    return unsub;
  }, []);

  // Initial check on mount
  useEffect(() => {
    (async () => {
      const ready = await isOfflineReady();
      const meta = await getMeta();
      const usage = await usageBytes();
      store.isReady = ready;
      store.meta = meta;
      store.usageBytes = usage;
      notify();
    })();
  }, []);

  // Track browser online/offline events
  useEffect(() => {
    const onOnline = () => {
      store.browserOffline = false;
      notify();
    };
    const onOffline = () => {
      store.browserOffline = true;
      notify();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ---- Download ----
  const download = useCallback(async (force = false): Promise<boolean> => {
    if (store.downloading) return false;

    const controller = new AbortController();
    store.abortController = controller;
    store.downloading = true;
    store.error = null;
    notify();

    try {
      const meta = await downloadPack({
        force,
        signal: controller.signal,
        onProgress: (p) => {
          store.progress = p;
          notify();
        },
      });
      const usage = await usageBytes();
      store.meta = meta;
      store.usageBytes = usage;
      store.isReady = true;
      store.error = null;
      return true;
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        store.error = 'Download cancelled';
      } else {
        store.error = err.message || 'Download failed';
      }
      return false;
    } finally {
      store.downloading = false;
      store.abortController = null;
      notify();
    }
  }, []);

  const cancel = useCallback(() => {
    store.abortController?.abort();
  }, []);

  // ---- Check for updates ----
  const checkUpdate = useCallback(async (): Promise<boolean> => {
    return needsUpdate();
  }, []);

  // ---- Translate ----
  const translate = useCallback(
    async (text: string, from: string, to: string): Promise<OfflineResult | null> => {
      // 1. Try offline first (fast, free, works without network)
      if (store.isReady) {
        const offlineResult = await offlineTranslate(text, from, to);
        if (offlineResult && offlineResult.text) {
          return offlineResult;
        }
      }

      // 2. Fall back to online API
      if (!store.browserOffline) {
        const onlineText = await onlineTranslate(text, from, to);
        if (onlineText) {
          return {
            text: onlineText,
            audio: null,
            source: 'none',
            passthrough: false,
          };
        }
      }

      // 3. Nothing available
      return null;
    },
    [],
  );

  // ---- Uninstall ----
  const uninstall = useCallback(async () => {
    await clearAll();
    store.isReady = false;
    store.meta = null;
    store.usageBytes = 0;
    store.progress = null;
    notify();
  }, []);

  // ---- Derived helpers ----
  const languages = store.meta?.languages ?? [];
  const audioCounts = store.meta?.audio_counts ?? {};
  const dictCounts = store.meta?.dict_counts ?? {};

  return {
    // state
    isReady: state.isReady,
    meta: state.meta,
    usageBytes: state.usageBytes,
    usageMB: state.usageBytes > 0 ? state.usageBytes / 1024 / 1024 : 0,
    progress: state.progress,
    downloading: state.downloading,
    error: state.error,
    browserOffline: state.browserOffline,
    languages,
    dictCounts,
    audioCounts,

    // actions
    download,
    cancel,
    checkUpdate,
    translate,
    uninstall,
  };
}

export type UseOfflineTranslation = ReturnType<typeof useOfflineTranslation>;