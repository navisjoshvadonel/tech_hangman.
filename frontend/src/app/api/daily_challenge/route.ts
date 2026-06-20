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

async function loadWordsJson(): Promise<WordsJson> {
  const jsonDirectory = path.join(process.cwd(), 'src/data');
  const fileContents = await fs.readFile(path.join(jsonDirectory, 'words.json'), 'utf8');
  return JSON.parse(fileContents);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || '';

  try {
    const res = await fetch(`${PYTHON_API}/daily_challenge?user_id=${userId}`, { signal: AbortSignal.timeout(45000) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (error) {
    // Backend offline: run fallback below
  }

  try {
    const wordsData = await loadWordsJson();
    
    // Flatten all categories and difficulties into a single list
    let pool: { word: string; hint: string; category: string; description: string }[] = [];
    for (const cat of Object.keys(wordsData)) {
      const diffs = wordsData[cat] || {};
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
      completed: false, // Client will override this using local storage if needed
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
