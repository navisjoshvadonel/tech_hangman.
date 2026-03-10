import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(`${PYTHON_API}/daily_complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(45000),
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Daily Complete Proxy Error:', error);
        return NextResponse.json({ success: false, message: 'Backend unreachable' });
    }
}
