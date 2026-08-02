// Shared proxy utility for all Next.js API routes
// Forwards requests to the Python backend with consistent error handling

const PYTHON_API = process.env.PYTHON_API_URL || 'http://127.0.0.1:5005/api';

export { PYTHON_API };

/**
 * Creates a standardized error response for backend connection failures.
 * Passes through 429 (rate limit) responses so the frontend can handle them.
 */
export function backendError(error: any, fallback?: Record<string, any>) {
    const isTimeout = error?.name === 'TimeoutError' || error?.message?.includes('timeout');
    const isAbort = error?.name === 'AbortError';

    const payload = {
        error: isTimeout || isAbort
            ? 'BACKEND WAKEUP TIMEOUT'
            : 'BACKEND CONNECTION FAILED',
        hint: isTimeout
            ? 'Backend is waking up. Wait 15s and try again.'
            : 'Check PYTHON_API_URL environment variable.',
        ...(fallback || {}),
    };

    return { payload, status: 503 as const };
}

/**
 * Proxy a fetch call to the Python backend.
 * Returns { data, status } — never throws.
 */
export async function proxyFetch(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
    fallback?: Record<string, any>
): Promise<{ data: any; status: number }> {
    const { timeoutMs = 45000, ...fetchInit } = init || {};
    try {
        const res = await fetch(`${PYTHON_API}${path}`, {
            ...fetchInit,
            signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json();
        return { data, status: res.status };
    } catch (error: any) {
        const { payload, status } = backendError(error, fallback);
        return { data: payload, status };
    }
}
