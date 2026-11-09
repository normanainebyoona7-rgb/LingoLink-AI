/**
 * Offline translation using the locally cached pack.
 *
 * Order of attempts:
 *   1. Exact phrase match (lowercased, punctuation-trimmed)
 *   2. Same phrase with source-language reverse lookup
 *      (if translating *from* a Ugandan language to English)
 *   3. Word-by-word fallback (translate each token, keep the rest as-is)
 *   4. Give up → return null so the caller can fall back to online
 *
 * Audio is attached only when a matching MP3 exists in IndexedDB.
 * All lookups are from IndexedDB, never from network.
 */
import { getDict, getReverse, getAudio, getMeta } from './storage';

export interface OfflineResult {
  text: string;
  audio: Blob | null;
  source: 'phrase' | 'reverse' | 'word' | 'none';
  /** True if the input was already in the target language. */
  passthrough: boolean;
}

let _metaCache: Awaited<ReturnType<typeof getMeta>> | null = null;

export async function isOfflineReady(): Promise<boolean> {
  const meta = await getMeta();
  return meta !== null && (meta.dict_counts?.luganda || 0) > 0;
}

export async function getOfflineLanguages(): Promise<string[]> {
  const meta = await getMeta();
  return meta?.languages ?? [];
}

/** Same hash as backend: md5(text.strip())[:16]. Implemented in sync.ts. */
import { md5 as _md5 } from './md5';
function hash16(text: string): string {
  return _md5(text.trim()).slice(0, 16);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEnglishLike(lang: string): boolean {
  return lang.toLowerCase() === 'english' || lang.toLowerCase() === 'en';
}

/**
 * Translate `text` from `from` to `to`, entirely offline.
 * Returns null if the pack isn't installed or no translation is possible.
 */
export async function offlineTranslate(
  text: string,
  from: string,
  to: string,
): Promise<OfflineResult | null> {
  if (!text || !text.trim()) {
    return { text: '', audio: null, source: 'none', passthrough: false };
  }

  const meta = await getMeta();
  if (!meta) return null;

  const src = from.toLowerCase();
  const dst = to.toLowerCase();

  // Passthrough: same language
  if (src === dst) {
    const audio = await tryAudio(text, dst);
    return { text, audio, source: 'none', passthrough: true };
  }

  const key = normalize(text);

  // 1. English → target
  if (isEnglishLike(src)) {
    const dict = await getDict(dst);
    if (dict) {
      const hit = dict[key];
      if (hit) {
        const audio = await tryAudio(hit, dst);
        return { text: hit, audio, source: 'phrase', passthrough: false };
      }
      // Word-by-word fallback
      const words = key.split(' ');
      if (words.length > 1) {
        const translated: string[] = [];
        let matchedAny = false;
        for (const w of words) {
          const wHit = dict[w];
          if (wHit) {
            translated.push(wHit);
            matchedAny = true;
          } else {
            translated.push(w);
          }
        }
        if (matchedAny) {
          const out = translated.join(' ');
          return { text: out, audio: null, source: 'word', passthrough: false };
        }
      }
    }
    return null;
  }

  // 2. Target → English
  if (isEnglishLike(dst)) {
    const rev = await getReverse(src);
    if (rev) {
      const hit = rev[key];
      if (hit) {
        return { text: hit, audio: null, source: 'reverse', passthrough: false };
      }
      const words = key.split(' ');
      if (words.length > 1) {
        const translated: string[] = [];
        let matchedAny = false;
        for (const w of words) {
          const wHit = rev[w];
          if (wHit) {
            translated.push(wHit);
            matchedAny = true;
          } else {
            translated.push(w);
          }
        }
        if (matchedAny) {
          return { text: translated.join(' '), audio: null, source: 'word', passthrough: false };
        }
      }
    }
    return null;
  }

  // 3. Target → target via English pivot (rare; only if both have English keys)
  const srcDict = await getDict(src);
  const dstDict = await getDict(dst);
  if (srcDict && dstDict) {
    // Try reverse(src) → English → dict(dst)
    const rev = await getReverse(src);
    const english = rev?.[key];
    if (english) {
      const out = dstDict[normalize(english)];
      if (out) {
        const audio = await tryAudio(out, dst);
        return { text: out, audio, source: 'phrase', passthrough: false };
      }
    }
  }

  return null;
}

async function tryAudio(text: string, lang: string): Promise<Blob | null> {
  try {
    return await getAudio(lang, hash16(text));
  } catch {
    return null;
  }
}

/**
 * Get every cached phrase for a language. Useful for the "Browse offline" UI.
 */
export async function getOfflinePhrases(lang: string): Promise<Array<{ en: string; target: string }>> {
  const dict = await getDict(lang);
  if (!dict) return [];
  return Object.entries(dict).map(([en, target]) => ({ en, target }));
}

/**
 * Count of phrases with audio, per language. Useful for UI status text.
 */
export async function getAudioStats(): Promise<Record<string, number>> {
  const meta = await getMeta();
  return meta?.audio_counts ?? {};
}