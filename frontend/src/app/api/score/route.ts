import { NextResponse } from 'next/server';
import { proxyFetch } from '../_proxy';

export async function POST(request: Request) {
    let body: any;
    try { body = await request.json(); } catch { body = {}; }

    const { data, status } = await proxyFetch('/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, {
        // Safe fallback: if backend is down, return neutral progress values
        highest_score: 0, xp: 0, rank: 'Beginner', level: 1, new_achievements: []
    });

    return NextResponse.json(data, { status });
}
