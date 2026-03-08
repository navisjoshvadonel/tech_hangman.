import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:5000/api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(`${PYTHON_API}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ highest_score: 0, xp: 0, rank: 'Beginner', level: 1, new_achievements: [] });
    }
}
