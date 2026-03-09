import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/api';

export async function GET() {
    try {
        const res = await fetch(`${PYTHON_API}/ping`, { signal: AbortSignal.timeout(9000) });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ status: "error", message: "Backend unreachable" }, { status: 503 });
    }
}
