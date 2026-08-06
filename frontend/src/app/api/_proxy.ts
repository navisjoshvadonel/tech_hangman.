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
 * Includes automatic single retry on timeout to handle server cold starts smoothly.
 */
export async function proxyFetch(
    path: string,
    init?: RequestInit & { timeoutMs?: number; retries?: number },
    fallback?: Record<string, any>
): Promise<{ data: any; status: number }> {
    const { timeoutMs = 60000, retries = 1, ...fetchInit } = init || {};
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${PYTHON_API}${path}`, {
                ...fetchInit,
                signal: AbortSignal.timeout(timeoutMs),
            });
            const data = await res.json();
            return { data, status: res.status };
        } catch (error: any) {
            lastError = error;
            // If timeout or network error occurs on initial attempt, wait 2s and retry once
            // (The initial attempt triggered Render cold start wakeup)
            const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError' || error?.message?.includes('timeout') || error?.message?.includes('fetch failed');
            if (attempt < retries && isTimeout) {
                console.log(`[ProxyFetch] Attempt ${attempt + 1} timed out while waking backend. Retrying in 2s...`);
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }
        }
    }

    const { payload, status } = backendError(lastError, fallback);
    return { data: payload, status };
}

