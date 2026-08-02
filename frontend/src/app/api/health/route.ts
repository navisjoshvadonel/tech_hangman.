import { NextResponse } from 'next/server';
import { proxyFetch } from '../_proxy';

// Health check: proxies to Python backend /api/health
// Used by Render healthCheckPath and can be polled by the frontend
export async function GET() {
    const { data, status } = await proxyFetch('/health', {}, {
        status: 'unreachable',
        db_ok: false,
        message: 'Backend not responding'
    });
    return NextResponse.json(data, { status });
}
