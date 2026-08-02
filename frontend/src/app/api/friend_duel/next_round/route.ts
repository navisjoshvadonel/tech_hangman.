import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5005/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const res = await fetch(`${PYTHON_API}/friend_duel/next_round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'BACKEND CONNECTION FAILED', details: error?.message },
      { status: 503 }
    );
  }
}
