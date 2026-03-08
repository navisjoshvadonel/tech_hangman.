import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:5000/api';

export async function POST(request: Request) {
    let body: any = {};
    try {
        body = await request.json();
        const res = await fetch(`${PYTHON_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Login Proxy Error:', error);
        // Python backend offline: return a guest session
        return NextResponse.json({
            username: body.username || 'GUEST',
            user_id: null,
            highest_score: 0,
            xp: 0,
            rank: 'Beginner',
            level: 1
        });
    }
}
