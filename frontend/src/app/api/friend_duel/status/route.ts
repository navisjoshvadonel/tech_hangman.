import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5005/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code') || '';
    const user_id = searchParams.get('user_id') || '';

    const res = await fetch(`${PYTHON_API}/friend_duel/status?code=${encodeURIComponent(code)}&user_id=${encodeURIComponent(user_id)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
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
