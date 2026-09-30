// Relative URLs keep the browser on the same origin behind Vite/reverse proxies.
export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const retries = options.retries ?? (method === 'GET' ? 2 : 1);
  let last: Error = new Error('Network unavailable');
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 4500);
    try {
      const response = await fetch(`/api${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal, cache: 'no-store',
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as {detail?: string} | null;
        throw new ApiError(typeof detail?.detail === 'string' ? detail.detail : `Server returned ${response.status}`, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      last = error instanceof Error ? error : new Error('Network unavailable');
      // Validation / safety denials must NOT be retried.
      if (last instanceof ApiError && last.status < 500) throw last;
      if (attempt < retries) await new Promise(resolve => window.setTimeout(resolve, 350*(attempt+1)));
    } finally { window.clearTimeout(timer); }
  }
  throw last;
}
