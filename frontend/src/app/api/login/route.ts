import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('Proxying login for:', body.username);

        const res = await fetch(`${PYTHON_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(2000), // 2s timeout
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error('Login Proxy Error:', error.message || error);
        return NextResponse.json({
            error: "BACKEND CONNECTION FAILED",
            details: error.message || "Unknown error"
        }, { status: 503 });
    }
}

