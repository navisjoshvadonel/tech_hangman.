import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '';
    const difficulty = searchParams.get('difficulty') || '';
    const userId = searchParams.get('user_id') || '';

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
        // Python backend not running — use the local words.json fallback
    }

    // Fallback: serve word from the local words.json
    try {
        const jsonDirectory = path.join(process.cwd(), 'src/data');
        const fileContents = await fs.readFile(path.join(jsonDirectory, 'words.json'), 'utf8');
        const wordsData = JSON.parse(fileContents);

        let pool: { word: string; clue?: string; hint?: string }[] = [];

        if (category && wordsData[category]) {
            const diffs = wordsData[category];
            if (difficulty && diffs[difficulty]) {
                pool = diffs[difficulty];
            } else {
                pool = [...(diffs.EASY || []), ...(diffs.MEDIUM || []), ...(diffs.HARD || [])];
            }
        } else {
            // No valid category — flatten all words
            for (const cat of Object.keys(wordsData)) {
                const diffs = wordsData[cat];
                pool = [...pool, ...(diffs.EASY || []), ...(diffs.MEDIUM || []), ...(diffs.HARD || [])];
            }
        }

        if (pool.length === 0) {
            return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'fallback' });
        }

        const wordObj = pool[Math.floor(Math.random() * pool.length)];
        return NextResponse.json({ ...wordObj, clue: wordObj.clue || wordObj.hint || 'No clue available.', status: 'ok' });
    } catch (error) {
        console.error('Word route error:', error);
        return NextResponse.json({ word: 'PROTOCOL', clue: 'A standard set of rules.', status: 'error' }, { status: 500 });
    }
}
