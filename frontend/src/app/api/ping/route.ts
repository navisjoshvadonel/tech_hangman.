import { NextResponse } from 'next/server';
import { proxyFetch } from '../_proxy';

export async function GET() {
    const { data, status } = await proxyFetch('/ping', {}, { status: 'error', message: 'Backend unreachable' });
    return NextResponse.json(data, { status });
}
