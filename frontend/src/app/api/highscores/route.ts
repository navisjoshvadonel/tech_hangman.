import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:5000/api';

export async function GET() {
    try {
        const res = await fetch(`${PYTHON_API}/highscores`);
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ score: [], speed: [], streak: [] });
    }
}
