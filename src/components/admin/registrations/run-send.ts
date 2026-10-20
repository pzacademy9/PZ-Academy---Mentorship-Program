// Shared by the message builder and the Messages sent list: calling the participants API and
// running an email send to the end without ever looping forever.
export const PARTICIPANTS_API = "/api/admin/participants";

const FLAT_RUNS_BEFORE_PAUSE = 3;
const MAX_RUNS = 300;
const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export async function call(url: string, method: "GET" | "POST", body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

/**
 * Calls the run route until nobody is waiting. Stops (never loops forever) when a call fails, or when
 * three calls in a row leave the waiting count where it was.
 *  - "done":   nobody is waiting any more.
 *  - "error":  a run call failed; some emails may already have gone out.
 *  - "paused": people are still waiting after repeated calls with no progress.
 */
export async function runSendLoop(
  sendId: string,
  opts: { start?: { sent: number; failed: number }; pauseMs?: number; onProgress?: (sent: number, failed: number) => void } = {},
): Promise<"done" | "error" | "paused"> {
  let sent = opts.start?.sent ?? 0;
  let failed = opts.start?.failed ?? 0;
  let lastPending = Number.POSITIVE_INFINITY;
  let flat = 0;
  for (let i = 0; i < MAX_RUNS; i += 1) {
    const { status, data } = await call(`${PARTICIPANTS_API}/sends/${sendId}/run`, "POST");
    if (status !== 200 || typeof data.pending !== "number") return "error";
    sent += Number(data.sent) || 0;
    failed += Number(data.failed) || 0;
    opts.onProgress?.(sent, failed);
    if (data.pending === 0) return "done";
    flat = data.pending < lastPending ? 0 : flat + 1;
    lastPending = data.pending;
    if (flat >= FLAT_RUNS_BEFORE_PAUSE) break;
    if (flat > 0) await wait(opts.pauseMs ?? 300);
  }
  return "paused";
}
