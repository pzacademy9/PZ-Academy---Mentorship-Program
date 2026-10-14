import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { JOB_HANDLERS } from "@/lib/landing/registration/job-handlers";

/**
 * Outbox for registration side effects (Sheet row, emails). The register route enqueues
 * and immediately runs them via waitUntil; the daily cron and the admin Retry button drain
 * whatever is left. A job is claimed by bumping `attempts` with an optimistic filter on the
 * old value and taking a 10-minute lease in next_run_at, so two workers never run it twice
 * and a crashed worker's job is picked up again after the lease.
 */

export type JobType = "sheet_append" | "email_received" | "email_members" | "email_admin";
export const JOB_TYPES: readonly JobType[] = ["sheet_append", "email_received", "email_members", "email_admin"];
export const MAX_ATTEMPTS = 5;
export const BACKOFF_MINUTES = [1, 5, 15, 60] as const;
const LEASE_MINUTES = 10;

interface JobRow { id: string; registration_id: string; type: string; attempts: number }
type Outcome = "done" | "retry" | "failed" | "skipped";

const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000).toISOString();

/** When to try again after `failedAttempts` failures (1-based): 1, 5, 15, then 60 minutes. */
export function nextRunAt(failedAttempts: number, now: Date): string {
  const i = Math.min(Math.max(failedAttempts, 1), BACKOFF_MINUTES.length) - 1;
  return plusMinutes(now, BACKOFF_MINUTES[i]);
}

export async function enqueueJobs(registrationId: string, types: JobType[]): Promise<void> {
  if (types.length === 0) return;
  try {
    const now = new Date().toISOString();
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .insert(types.map((type) => ({ registration_id: registrationId, type, status: "pending", attempts: 0, next_run_at: now })));
    if (error) console.error("[landing-jobs] enqueue failed:", error.code);
  } catch {
    console.error("[landing-jobs] enqueue crashed");
  }
}

async function runJob(job: JobRow): Promise<Outcome> {
  const admin = createAdminSupabase();
  const attempts = job.attempts + 1;
  const { data: claimed } = await admin
    .from("landing_jobs")
    .update({ status: "running", attempts, next_run_at: plusMinutes(new Date(), LEASE_MINUTES) })
    .eq("id", job.id)
    .eq("attempts", job.attempts)
    .in("status", ["pending", "running"])
    .select("id")
    .maybeSingle();
  if (!claimed) return "skipped";

  try {
    const handler = JOB_HANDLERS[job.type as JobType];
    if (!handler) throw new Error(`Unknown job type ${job.type}`);
    await handler(job.registration_id);
    await admin.from("landing_jobs").update({ status: "done", last_error: null }).eq("id", job.id);
    return "done";
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const dead = attempts >= MAX_ATTEMPTS;
    await admin
      .from("landing_jobs")
      .update(dead ? { status: "failed", last_error: message } : { status: "pending", last_error: message, next_run_at: nextRunAt(attempts, new Date()) })
      .eq("id", job.id);
    console.warn(`[landing-jobs] ${job.type} attempt ${attempts} failed`);
    return dead ? "failed" : "retry";
  }
}

const byTypeOrder = (a: JobRow, b: JobRow) => JOB_TYPES.indexOf(a.type as JobType) - JOB_TYPES.indexOf(b.type as JobType);

/** Runs this registration's due jobs in a fixed order (Sheet first). Never throws. */
export async function runJobsFor(registrationId: string): Promise<void> {
  try {
    const { data } = await createAdminSupabase()
      .from("landing_jobs")
      .select("id, registration_id, type, attempts")
      .eq("registration_id", registrationId)
      .eq("status", "pending")
      .lte("next_run_at", new Date().toISOString());
    for (const job of [...((data ?? []) as JobRow[])].sort(byTypeOrder)) await runJob(job);
  } catch {
    console.error("[landing-jobs] runJobsFor crashed");
  }
}

export async function drainDueJobs(limit = 25): Promise<{ ran: number; failed: number }> {
  let ran = 0;
  let failed = 0;
  try {
    const { data } = await createAdminSupabase()
      .from("landing_jobs")
      .select("id, registration_id, type, attempts")
      .in("status", ["pending", "running"])
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(limit);
    for (const job of (data ?? []) as JobRow[]) {
      const outcome = await runJob(job);
      if (outcome === "skipped") continue;
      ran += 1;
      if (outcome !== "done") failed += 1;
    }
  } catch {
    console.error("[landing-jobs] drain crashed");
  }
  return { ran, failed };
}

/**
 * Admin Retry: failed jobs of one page go back to pending with a fresh attempt budget.
 * Failed jobs are found through the FK (no registration-id list, so no max_rows truncation
 * or long URLs) and requeued in small batches until none are left.
 */
export async function retryFailedJobs(pageId: string): Promise<number> {
  const admin = createAdminSupabase();
  const BATCH = 100;
  let total = 0;
  for (let round = 0; round < 1000; round++) {
    const { data, error } = await admin
      .from("landing_jobs")
      .select("id, landing_registrations!inner(page_id)")
      .eq("status", "failed")
      .eq("landing_registrations.page_id", pageId)
      .limit(BATCH);
    if (error) throw error;
    const ids = ((data ?? []) as { id: string }[]).map((j) => j.id);
    if (ids.length === 0) break;
    const { data: updated, error: upErr } = await admin
      .from("landing_jobs")
      .update({ status: "pending", attempts: 0, next_run_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "failed")
      .select("id");
    if (upErr) throw upErr;
    const n = (updated ?? []).length;
    total += n;
    if (n === 0 || ids.length < BATCH) break;
  }
  return total;
}
