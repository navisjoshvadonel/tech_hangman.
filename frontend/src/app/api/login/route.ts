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
            signal: AbortSignal.timeout(9000), // 9s timeout for Render cold start
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error('Login Proxy Error:', error.message || error);
        const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');
        return NextResponse.json({
            error: isTimeout ? "BACKEND WAKEUP TIMEOUT" : "BACKEND CONNECTION FAILED",
            details: error.message || "Unknown error",
            hint: isTimeout ? "Render is still waking up. Wait 15s and try again." : "Check if PYTHON_API_URL is correct on Vercel."
        }, { status: 503 });
    }
}

