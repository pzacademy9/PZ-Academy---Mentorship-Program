const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

// Best effort only: this lives in the memory of one server instance. Serverless instances do
// not share it, so a determined caller can get more than the limit. It only slows casual abuse.
const hits = new Map<string, number[]>();

/** At most 10 requests per key per minute. Returns false when the key is over the limit. */
export function allowRequest(key: string, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    });
  }
  return true;
}
