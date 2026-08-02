import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5005/api';

async function proxyRequest(request: Request, method: string, subPath: string) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();
    const targetUrl = `${PYTHON_API}/multiplayer/${subPath}${searchParams ? '?' + searchParams : ''}`;

    const headers: Record<string, string> = {};
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    let body: any = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await request.text();
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(45000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error(`Multiplayer Proxy Error (${method} /api/multiplayer/${subPath}):`, error.message || error);
    const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');
    return NextResponse.json({
      error: isTimeout ? "BACKEND WAKEUP TIMEOUT" : "BACKEND CONNECTION FAILED",
      details: error.message || "Unknown error",
    }, { status: 503 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pathArr = path || [];
  const subPath = pathArr.join('/');
  return proxyRequest(request, 'GET', subPath);
}

export async function POST(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pathArr = path || [];
  const subPath = pathArr.join('/');
  return proxyRequest(request, 'POST', subPath);
}
