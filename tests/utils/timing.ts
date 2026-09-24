import { Page } from '@playwright/test';

/**
 * Times `action` and logs `label -> Nms`. No hard assertion here by design — this is
 * step 1 of the Team Inbox perf work (log first, tighten into real budgets once we have
 * a baseline across a few runs). Callers may still add a generous gross-regression
 * ceiling on top of the returned value, the way auth.spec.ts does for login.
 */
export async function timeAction(label: string, action: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await action();
  const ms = Date.now() - start;
  console.log(`${label} -> ${ms}ms`);
  return ms;
}

export interface ResponseLog {
  url: string;
  status: number;
  sizeBytes: number;
}

/**
 * Records every response fired while `action` runs. Used to audit a single interaction
 * (e.g. switching a filter) for N+1-shaped request bursts or oversized payloads.
 */
export async function captureResponses(page: Page, action: () => Promise<void>): Promise<ResponseLog[]> {
  const logs: ResponseLog[] = [];

  const onResponse = async (response: import('@playwright/test').Response) => {
    try {
      const headerLength = response.headers()['content-length'];
      let sizeBytes = headerLength ? parseInt(headerLength, 10) : 0;
      if (!sizeBytes) {
        const body = await response.body().catch(() => null);
        sizeBytes = body ? body.length : 0;
      }
      logs.push({ url: response.url(), status: response.status(), sizeBytes });
    } catch {
      // response may have already closed (e.g. redirect/aborted) — skip it
    }
  };

  page.on('response', onResponse);
  try {
    await action();
  } finally {
    page.off('response', onResponse);
  }

  return logs;
}

/**
 * Collapses ID-like path segments (UUIDs, ULIDs, or any long alphanumeric token) to `:id`
 * so that e.g. `/api/v1/contacts/01a0198b-...` and `/api/v1/contacts/01a01935-...` are
 * recognized as the same route fetched N times — the shape a real N+1 burst takes,
 * since each call hits a distinct resource ID rather than an identical URL.
 */
function normalizeRoute(url: string): string {
  const path = url.split('?')[0];
  return path
    .split('/')
    .map((segment) => (/^[0-9a-zA-Z-]{8,}$/.test(segment) && /\d/.test(segment) ? ':id' : segment))
    .join('/');
}

/** Groups by normalized route (IDs collapsed, query string stripped) and returns routes called more than `minCalls` times. */
export function findRepeatedRequests(logs: ResponseLog[], minCalls = 3): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const path = normalizeRoute(log.url);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > minCalls)
    .map(([path, count]) => ({ path, count }));
}

/** Returns responses at or above `minBytes` (default 500KB). */
export function findOversizedResponses(logs: ResponseLog[], minBytes = 500_000): ResponseLog[] {
  return logs.filter((log) => log.sizeBytes >= minBytes);
}
