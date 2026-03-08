import { NextResponse } from 'next/server';
import { TECH_WORDS } from '@/data/words';

export async function GET() {
    const randomWord = TECH_WORDS[Math.floor(Math.random() * TECH_WORDS.length)];
    return NextResponse.json(randomWord);
}
