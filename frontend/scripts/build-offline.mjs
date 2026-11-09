#!/usr/bin/env node
/**
 * Build the offline translation pack.
 *
 * Sources (all in ../backend/app/):
 *   - common_phrases.json      {phrases: {lang: {en: target}}, reverse: {lang: {target: en}}}
 *   - {lang}_corpus.json       {en_sentence: target_sentence}
 *   - voice_cache/{lang}/*.wav
 *
 * Output: ./public/offline/
 *   - {lang}.json              flat {en: target} map (common phrases merged over corpus)
 *   - reverse.json             {lang: {target: en}} reverse index
 *   - voice/{lang}/*.mp3       cached audio, converted from WAV 64k mono
 *   - meta.json / manifest.json
 *
 * Usage: node scripts/build-offline.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'backend', 'app');
const OUT = path.resolve(FRONTEND, 'public', 'offline');

const LANGS = ['luganda', 'swahili'];
const VOICE_LANGS = ['luganda', 'swahili'];
const CORPUS_LIMIT_PER_LANG = 2000;

function hashWav(text) {
  // Must match backend/app/routers/tts.py: md5(text.strip())[:16]
  return crypto.createHash('md5').update(text.strip ? text.strip() : text.trim(), 'utf8').digest('hex').slice(0, 16);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJSON(p, fallback) {
  try {
    const txt = await fs.readFile(p, 'utf-8');
    return JSON.parse(txt);
  } catch (e) {
    console.warn(`  ! could not read ${p}: ${e.message}`);
    return fallback;
  }
}

function pickTopCorpus(corpus, limit) {
  const entries = Object.entries(corpus || {});
  entries.sort((a, b) => a[0].length - b[0].length);
  return Object.fromEntries(entries.slice(0, limit));
}

async function buildDictionaries() {
  console.log('Building dictionaries...');
  await ensureDir(OUT);

  const common = await readJSON(path.join(BACKEND, 'common_phrases.json'), { phrases: {}, reverse: {} });
  const commonPhrases = common.phrases || {};
  const commonReverse = common.reverse || {};

  const perLang = {};
  const reverse = {};
  // Also keep a set of expected WAV hashes per language, for voice filtering.
  const expectedHashes = {};

  for (const lang of LANGS) {
    const merged = {};

    const corpus = await readJSON(path.join(BACKEND, `${lang}_corpus.json`), {});
    const trimmed = pickTopCorpus(corpus, CORPUS_LIMIT_PER_LANG);
    Object.assign(merged, trimmed);
    console.log(`  ${lang}: ${Object.keys(trimmed).length} corpus pairs (trimmed from ${Object.keys(corpus).length})`);

    if (commonPhrases[lang]) {
      let count = 0;
      for (const [en, target] of Object.entries(commonPhrases[lang])) {
        merged[en.toLowerCase()] = target;
        count++;
      }
      console.log(`  ${lang}: +${count} common phrases (override)`);
    }

    perLang[lang] = merged;

    // Build expected WAV hash set from target-language strings
    const hashSet = new Set();
    for (const target of Object.values(merged)) {
      if (target) hashSet.add(hashWav(String(target)));
    }
    expectedHashes[lang] = hashSet;
    console.log(`  ${lang}: ${hashSet.size} expected voice hashes`);

    // Reverse index
    reverse[lang] = {};
    if (commonReverse[lang]) {
      for (const [target, en] of Object.entries(commonReverse[lang])) {
        reverse[lang][target.toLowerCase()] = en;
      }
    }
    for (const [en, target] of Object.entries(merged)) {
      if (target && !reverse[lang][target.toLowerCase()]) {
        reverse[lang][target.toLowerCase()] = en;
      }
    }
    console.log(`  ${lang}: ${Object.keys(reverse[lang]).length} reverse entries`);
  }

  for (const lang of LANGS) {
    const file = path.join(OUT, `${lang}.json`);
    const json = JSON.stringify(perLang[lang] || {});
    await fs.writeFile(file, json);
    console.log(`  -> ${lang}.json (${Object.keys(perLang[lang] || {}).length} entries, ${(json.length / 1024).toFixed(0)} KB)`);
  }

  const reverseJson = JSON.stringify(reverse);
  await fs.writeFile(path.join(OUT, 'reverse.json'), reverseJson);
  console.log(`  -> reverse.json (${(reverseJson.length / 1024).toFixed(0)} KB)`);

  return { perLang, reverse, expectedHashes };
}

function convertToMp3(wavPath, mp3Path) {
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', wavPath,
    '-ac', '1', '-ar', '22050', '-b:a', '64k',
    mp3Path,
  ], { encoding: 'utf-8' });
  return r.status === 0;
}

async function buildVoiceCache(expectedHashes) {
  console.log('Converting voice cache (WAV → MP3)...');
  const voiceSrc = path.join(BACKEND, 'voice_cache');
  const voiceDst = path.join(OUT, 'voice');
  await ensureDir(voiceDst);

  let totalBytes = 0;
  let totalFiles = 0;
  let skipped = 0;
  const perLangCounts = {};

  for (const lang of VOICE_LANGS) {
    const srcDir = path.join(voiceSrc, lang);
    const dstDir = path.join(voiceDst, lang);
    await ensureDir(dstDir);
    perLangCounts[lang] = 0;

    const wanted = expectedHashes[lang] || new Set();
    try {
      const files = await fs.readdir(srcDir);
      const wavs = files.filter(f => f.endsWith('.wav'));
      for (const wav of wavs) {
        const base = path.basename(wav, '.wav');
        if (!wanted.has(base)) {
          skipped++;
          continue;
        }
        const src = path.join(srcDir, wav);
        const dst = path.join(dstDir, `${base}.mp3`);
        const ok = convertToMp3(src, dst);
        if (!ok) {
          console.warn(`  ! ffmpeg failed on ${wav}`);
          continue;
        }
        const stat = await fs.stat(dst);
        totalBytes += stat.size;
        totalFiles++;
        perLangCounts[lang]++;
      }
      console.log(`  ${lang}: ${perLangCounts[lang]} files converted`);
    } catch (e) {
      console.warn(`  ! ${lang}: ${e.message}`);
    }
  }

  console.log(`  Skipped: ${skipped} WAVs (no matching dictionary entry)`);
  console.log(`  Total: ${totalFiles} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  return { totalFiles, totalBytes, perLangCounts, skipped };
}

async function main() {
  console.log('=== Building offline pack ===\n');
  const { expectedHashes } = await buildDictionaries();
  const voice = await buildVoiceCache(expectedHashes);

  const manifest = {
    version: Date.now().toString(),
    generated_at: new Date().toISOString(),
    languages: LANGS,
    voice_languages: VOICE_LANGS,
    voice: voice,
  };
  const json = JSON.stringify(manifest, null, 2);
  await fs.writeFile(path.join(OUT, 'meta.json'), json);
  await fs.writeFile(path.join(OUT, 'manifest.json'), json);
  console.log(`  -> manifest.json`);

  console.log('\n=== Done ===');
  console.log(`Output: ${OUT}`);
  console.log(`Version: ${manifest.version}`);
  console.log(`Total voice size: ${(voice.totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(e => {
  console.error('BUILD FAILED:', e);
  process.exit(1);
});