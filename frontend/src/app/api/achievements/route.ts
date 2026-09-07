import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || '';
const isVercel = process.env.VERCEL === '1';
const hasCustomPythonApi = Boolean(PYTHON_API && !PYTHON_API.includes('127.0.0.1') && !PYTHON_API.includes('localhost'));

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (hasCustomPythonApi || (!isVercel && PYTHON_API)) {
        try {
            const res = await fetch(`${PYTHON_API}/achievements?user_id=${userId}`, { signal: AbortSignal.timeout(1500) });
            if (res.ok) {
                const data = await res.json();
                return NextResponse.json(data, { status: res.status });
            }
        } catch {
            // Fall through to default achievements payload
        }
    }

    return NextResponse.json({ achievements: [], unlocked: [] }, { status: 200 });
}
