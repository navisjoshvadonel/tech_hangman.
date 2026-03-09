import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    try {
        const res = await fetch(`${PYTHON_API}/achievements?user_id=${userId}`, { signal: AbortSignal.timeout(9000) });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Achievements Proxy Error:', error);
        return NextResponse.json({ error: "Backend Unreachable" }, { status: 503 });
    }
}
