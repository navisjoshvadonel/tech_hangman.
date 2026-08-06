import { NextResponse } from 'next/server';
import { proxyFetch } from '../_proxy';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'ALL';
    const difficulty = searchParams.get('difficulty') || 'ALL';

    const { data, status } = await proxyFetch(
        `/highscores?category=${encodeURIComponent(category)}&difficulty=${encodeURIComponent(difficulty)}`,
        {},
        { score: [], speed: [], streak: [] }
    );

    return NextResponse.json(data, { status });
}

