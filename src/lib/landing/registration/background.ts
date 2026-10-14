import "server-only";
import { waitUntil } from "@vercel/functions";

/**
 * Keeps work running after the response is sent (Next 14.2 has no stable after()).
 * On Vercel, waitUntil extends the function's lifetime; locally the promise simply runs.
 * Rejections are swallowed here: anything that matters is retried by the landing_jobs outbox.
 */
export function runInBackground(task: Promise<unknown>): void {
  waitUntil(
    task.catch((err: unknown) => {
      console.error("[landing] background task failed:", err instanceof Error ? err.message : "unknown error");
    }),
  );
}
