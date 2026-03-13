import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const missionKey = searchParams.get('mission_key') || '';

  try {
    const res = await fetch(`${PYTHON_API}/mission/leaderboard?mission_key=${encodeURIComponent(missionKey)}`, {
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}