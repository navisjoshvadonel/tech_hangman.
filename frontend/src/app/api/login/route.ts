import { NextResponse } from 'next/server';
import { proxyFetch } from '../_proxy';

export async function POST(request: Request) {
    let body: any;
    try { body = await request.json(); } catch { body = {}; }

    const { data, status } = await proxyFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    return NextResponse.json(data, { status });
}
