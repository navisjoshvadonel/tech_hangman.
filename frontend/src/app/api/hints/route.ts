import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(`${PYTHON_API}/hints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Hints Proxy Error:', error);
        return NextResponse.json({ error: "Backend Unreachable" }, { status: 503 });
    }
}
