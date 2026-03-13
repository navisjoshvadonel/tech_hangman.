import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

type WordObj = { word: string; clue?: string; hint?: string; description?: string };

type WordsJson = Record<string, Record<string, WordObj[]>>;

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

async function loadWordsJson(): Promise<WordsJson> {
  const jsonDirectory = path.join(process.cwd(), 'src/data');
  const fileContents = await fs.readFile(path.join(jsonDirectory, 'words.json'), 'utf8');
  return JSON.parse(fileContents);
}

function buildPool(wordsData: WordsJson, category: string, difficulty: string): WordObj[] {
  let pool: WordObj[] = [];

  const cat = String(category || '').toUpperCase();
  const diff = String(difficulty || '').toUpperCase();

  if (cat && wordsData[cat]) {
    const diffs = wordsData[cat];
    if (diff && diffs[diff]) {
      pool = diffs[diff];
    } else {
      pool = [...(diffs.EASY || []), ...(diffs.MEDIUM || []), ...(diffs.HARD || [])];
    }
  } else {
    // No valid category: flatten all words in deterministic key order.
    for (const c of Object.keys(wordsData).sort()) {
      const diffs = wordsData[c] || ({} as any);
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

  // Seeded missions: deterministic selection from local words.json.
  // We bypass the Python backend so all players get the same run.
  if (seed && iParam !== null) {
    try {
      const wordsData = await loadWordsJson();
      const pool = buildPool(wordsData, category, difficulty);

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

  // First, try to proxy to the Python backend (when running locally with the backend)
  try {
    const params = new URLSearchParams({ category, difficulty });
    if (userId) params.set('user_id', userId);
    const res = await fetch(`${PYTHON_API}/word?${params}`, { signal: AbortSignal.timeout(45000) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Python backend not running - use the local words.json fallback
  }

  // Fallback: serve word from the local words.json
  try {
    const wordsData = await loadWordsJson();
    const pool = buildPool(wordsData, category, difficulty);

    if (pool.length === 0) {
      return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'fallback' });
    }

    const wordObj = pool[Math.floor(Math.random() * pool.length)];
    return NextResponse.json({
      ...wordObj,
      word: String(wordObj.word || '').toUpperCase(),
      clue: wordObj.clue || wordObj.hint || 'No clue available.',
      status: 'ok',
    });
  } catch (error) {
    console.error('Word route error:', error);
    return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'error' }, { status: 500 });
  }
}