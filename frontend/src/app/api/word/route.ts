import { NextResponse } from 'next/server';
import wordsData from '@/data/words.json';

const PYTHON_API = process.env.PYTHON_API_URL || '';
const isVercel = process.env.VERCEL === '1';
const hasCustomPythonApi = Boolean(PYTHON_API && !PYTHON_API.includes('127.0.0.1') && !PYTHON_API.includes('localhost'));

type WordObj = { word: string; clue?: string; hint?: string; description?: string };
type WordsJson = Record<string, Record<string, WordObj[]>>;

const typedWordsData = wordsData as unknown as WordsJson;

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let x = (seed >>> 0) || 1;

  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }

  return a;
}

function buildPool(data: WordsJson, category: string, difficulty: string): WordObj[] {
  let pool: WordObj[] = [];

  const cat = String(category || '').toUpperCase();
  const diff = String(difficulty || '').toUpperCase();

  if (cat && data[cat]) {
    const diffs = data[cat];
    if (diff && diffs[diff]) {
      pool = diffs[diff];
    } else {
      pool = [...(diffs.EASY || []), ...(diffs.MEDIUM || []), ...(diffs.HARD || [])];
    }
  } else {
    // No valid category: flatten all words in deterministic key order.
    for (const c of Object.keys(data).sort()) {
      const diffs = data[c] || ({} as any);
      pool = [...pool, ...(diffs.EASY || []), ...(diffs.MEDIUM || []), ...(diffs.HARD || [])];
    }
  }

  return pool;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || '';
  const difficulty = searchParams.get('difficulty') || '';
  const userId = searchParams.get('user_id') || '';

  const seed = searchParams.get('seed');
  const iParam = searchParams.get('i');

  // 1. Seeded missions: deterministic selection from local words.json.
  if (seed && iParam !== null) {
    try {
      const pool = buildPool(typedWordsData, category, difficulty);

      if (pool.length === 0) {
        return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'seeded_fallback' });
      }

      const base = fnv1a32(`${seed}|${String(category || '').toUpperCase()}|${String(difficulty || '').toUpperCase()}`);
      const shuffled = seededShuffle(pool, base);

      const idxRaw = parseInt(iParam, 10);
      const idxSafe = Number.isFinite(idxRaw) ? idxRaw : 0;
      const idx = ((idxSafe % shuffled.length) + shuffled.length) % shuffled.length;

      const wordObj = shuffled[idx];
      return NextResponse.json({
        ...wordObj,
        word: String(wordObj.word || '').toUpperCase(),
        clue: wordObj.clue || wordObj.hint || 'No clue available.',
        status: 'seeded',
      });
    } catch (error) {
      console.error('Seeded word route error:', error);
      return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'seeded_error' }, { status: 500 });
    }
  }

  // 2. If a custom external Python API is configured (or running local fullstack dev),
  // try proxying with a STRICT 1500ms timeout.
  if (hasCustomPythonApi || (!isVercel && PYTHON_API)) {
    try {
      const params = new URLSearchParams({ category, difficulty });
      if (userId) params.set('user_id', userId);
      const exclude = searchParams.get('exclude');
      if (exclude) params.set('exclude', exclude);
      const res = await fetch(`${PYTHON_API}/word?${params}`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend is offline, asleep, or slow - fallback instantly to embedded words
    }
  }

  // 3. Instant local words.json delivery (< 2ms)
  try {
    const pool = buildPool(typedWordsData, category, difficulty);

    if (pool.length === 0) {
      return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'fallback', words_total: 0, words_remaining: 0 });
    }

    const excludeParam = searchParams.get('exclude') || '';
    const excludeList = excludeParam ? excludeParam.toUpperCase().split(',') : [];
    const filteredPool = pool.filter(w => !excludeList.includes(String(w.word || '').toUpperCase()));

    const poolToUse = filteredPool.length > 0 ? filteredPool : pool;
    const wordObj = poolToUse[Math.floor(Math.random() * poolToUse.length)];

    return NextResponse.json({
      ...wordObj,
      word: String(wordObj.word || '').toUpperCase(),
      clue: wordObj.clue || wordObj.hint || 'No clue available.',
      status: 'ok',
      words_total: pool.length,
      words_remaining: filteredPool.length,
    });
  } catch (error) {
    console.error('Word route error:', error);
    return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'error', words_total: 0, words_remaining: 0 }, { status: 500 });
  }
}