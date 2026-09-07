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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || '';

  if (hasCustomPythonApi || (!isVercel && PYTHON_API)) {
    try {
      const res = await fetch(`${PYTHON_API}/daily_challenge?user_id=${userId}`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend offline: run fallback below
    }
  }

  try {
    // Flatten all categories and difficulties into a single list
    const pool: { word: string; hint: string; category: string; description: string }[] = [];
    for (const cat of Object.keys(typedWordsData)) {
      const diffs = typedWordsData[cat] || {};
      for (const diff of Object.keys(diffs)) {
        const list = diffs[diff] || [];
        for (const item of list) {
          pool.push({
            word: String(item.word || '').toUpperCase(),
            hint: item.clue || item.hint || 'No clue available.',
            category: cat,
            description: item.description || ''
          });
        }
      }
    }

    if (pool.length === 0) {
      return NextResponse.json({
        word: 'PROTOCOL',
        hint: 'A standard set of rules.',
        category: 'NETWORKING',
        description: 'Default protocol word.',
        completed: false,
        status: 'fallback'
      });
    }

    // Seed based on today's date YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    const seed = fnv1a32(today);
    const wordObj = pool[seed % pool.length];

    return NextResponse.json({
      word: wordObj.word,
      hint: wordObj.hint,
      category: wordObj.category,
      description: wordObj.description,
      completed: false,
      status: 'ok'
    });

  } catch (err: any) {
    console.error('Daily Challenge Fallback Error:', err);
    return NextResponse.json({
      word: 'PROTOCOL',
      hint: 'A standard set of rules.',
      category: 'NETWORKING',
      description: 'Default protocol word.',
      completed: false,
      status: 'error'
    }, { status: 500 });
  }
}
