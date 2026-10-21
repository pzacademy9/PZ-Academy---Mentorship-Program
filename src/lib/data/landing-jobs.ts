import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { JOB_HANDLERS } from "@/lib/landing/registration/job-handlers";
import { sweepStaleClaims } from "@/lib/data/landing-email-log";

/**
 * Outbox for registration side effects (Sheet row, emails). The register route enqueues
 * and immediately runs them via waitUntil; the daily cron and the admin Retry button drain
 * whatever is left. A job is claimed by bumping `attempts` with an optimistic filter on the
 * old value and taking a 10-minute lease in next_run_at, so two workers never run it twice
 * and a crashed worker's job is picked up again after the lease.
 */

export type JobType = "sheet_append" | "email_received" | "email_members" | "email_admin" | "sheet_status" | "enrollment_sync" | "email_status" | "sheet_details";
// Run order: the confirmation email goes first so a slow Apps Script call never delays it.
export const JOB_TYPES: readonly JobType[] = ["email_received", "sheet_append", "sheet_status", "enrollment_sync", "email_status", "sheet_details", "email_members", "email_admin"];
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

/**
 * Inserts one pending job per type. Returns true when the jobs exist afterwards: a duplicate
 * (23505, unique registration_id + type) means an earlier attempt already queued them, so a retry is idempotent.
 */
export async function enqueueJobs(registrationId: string, types: JobType[]): Promise<boolean> {
  if (types.length === 0) return true;
  try {
    const now = new Date().toISOString();
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .insert(types.map((type) => ({ registration_id: registrationId, type, status: "pending", attempts: 0, next_run_at: now })));
    if (error) {
      if (error.code === "23505") return true;
      console.error("[landing-jobs] enqueue failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue crashed");
    return false;
  }
}

/**
 * One coalesced sheet_status job per registration: upsert on (registration_id, type) and put it back to
 * pending with a fresh budget, so the handler always sends the current values. Never throws.
 */
export async function enqueueSheetStatus(registrationId: string): Promise<boolean> {
  try {
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .upsert(
        { registration_id: registrationId, type: "sheet_status", status: "pending", attempts: 0, next_run_at: new Date().toISOString(), last_error: null },
        { onConflict: "registration_id,type" },
      );
    if (error) {
      console.error("[landing-jobs] enqueue sheet_status failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue sheet_status crashed");
    return false;
  }
}

/**
 * One coalesced sheet_details job per registration (name/email/WhatsApp push): upsert back to pending with a
 * fresh budget so the handler always sends the current values. Never throws; true only when the upsert succeeded.
 */
export async function enqueueSheetDetails(registrationId: string): Promise<boolean> {
  try {
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .upsert(
        { registration_id: registrationId, type: "sheet_details", status: "pending", attempts: 0, next_run_at: new Date().toISOString(), last_error: null },
        { onConflict: "registration_id,type" },
      );
    if (error) {
      console.error("[landing-jobs] enqueue sheet_details failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue sheet_details crashed");
    return false;
  }
}

/**
 * Status side effects (enrollment sync + status email): upsert BOTH jobs back to pending with a fresh budget.
 * Handlers read the current status, so flip-flops coalesce safely. Never throws; true only when the upsert succeeded.
 */
export async function enqueueStatusEffects(registrationId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .upsert(
        (["enrollment_sync", "email_status"] as const).map((type) => ({ registration_id: registrationId, type, status: "pending", attempts: 0, next_run_at: now, last_error: null })),
        { onConflict: "registration_id,type" },
      );
    if (error) {
      console.error("[landing-jobs] enqueue status effects failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue status effects crashed");
    return false;
  }
}

/** One email_status job: upsert back to pending with a fresh budget. Never throws; true only when the upsert succeeded. */
export async function enqueueEmailStatus(registrationId: string): Promise<boolean> {
  try {
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .upsert(
        { registration_id: registrationId, type: "email_status", status: "pending", attempts: 0, next_run_at: new Date().toISOString(), last_error: null },
        { onConflict: "registration_id,type" },
      );
    if (error) {
      console.error("[landing-jobs] enqueue email_status failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue email_status crashed");
    return false;
  }
}

/**
 * One enrollment_sync job: upsert back to pending with a fresh budget (an old finished job must run again).
 * No email. Never throws; true only when the upsert succeeded.
 */
export async function enqueueEnrollmentSync(registrationId: string): Promise<boolean> {
  try {
    const { error } = await createAdminSupabase()
      .from("landing_jobs")
      .upsert(
        { registration_id: registrationId, type: "enrollment_sync", status: "pending", attempts: 0, next_run_at: new Date().toISOString(), last_error: null },
        { onConflict: "registration_id,type" },
      );
    if (error) {
      console.error("[landing-jobs] enqueue enrollment_sync failed:", error.code);
      return false;
    }
    return true;
  } catch {
    console.error("[landing-jobs] enqueue enrollment_sync crashed");
    return false;
  }
}

/** Last resort when the outbox cannot be written: run the handlers once, in order, without a job row. Never throws. */
export async function runJobsDirect(registrationId: string, types: JobType[]): Promise<void> {
  for (const type of [...types].sort((a, b) => JOB_TYPES.indexOf(a) - JOB_TYPES.indexOf(b))) {
    try {
      await JOB_HANDLERS[type](registrationId);
    } catch {
      console.error(`[landing-jobs] direct ${type} failed`);
    }
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
    await admin.from("landing_jobs").update({ status: "done", last_error: null }).eq("id", job.id).eq("attempts", attempts); // a re-enqueue resets attempts, so a stale worker matches nothing
    return "done";
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const dead = attempts >= MAX_ATTEMPTS;
    await admin
      .from("landing_jobs")
      .update(dead ? { status: "failed", last_error: message } : { status: "pending", last_error: message, next_run_at: nextRunAt(attempts, new Date()) })
      .eq("id", job.id)
      .eq("attempts", attempts);
    console.warn(`[landing-jobs] ${job.type} attempt ${attempts} failed`);
    return dead ? "failed" : "retry";
  }
}

const byTypeOrder = (a: JobRow, b: JobRow) => JOB_TYPES.indexOf(a.type as JobType) - JOB_TYPES.indexOf(b.type as JobType);

/** Runs this registration's due jobs in a fixed order (confirmation email first). Never throws. */
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
    try {
      const { registrationIds } = await sweepStaleClaims();
      for (const id of registrationIds) {
        // Retry once: a failed enqueue would leave a released email with no job to send it.
        if (!(await enqueueEmailStatus(id)) && !(await enqueueEmailStatus(id))) {
          console.warn("[landing-jobs] could not re-queue the email job after a stale claim sweep:", id);
        }
      }
    } catch {
      console.warn("[landing-jobs] stale email claim sweep failed"); // never stop the drain
    }
    const { data } = await createAdminSupabase()
      .from("landing_jobs")
      .select("id, registration_id, type, attempts")
      .in("status", ["pending", "running"])
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(limit);
    // Stable sort: JOB_TYPES order, next_run_at order kept within a type (enrollment_sync before email_status).
    for (const job of [...((data ?? []) as JobRow[])].sort(byTypeOrder)) {
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

/**
 * Page-scoped requeue by FK join, in batches. `statuses` limits which jobs are touched; `type`
 * narrows to one job type; `patch` is what they are set to. Returns how many rows were updated.
 */
async function requeueByPage(
  pageId: string,
  opts: { statuses: string[]; type?: JobType; patch: { status?: string; attempts?: number; next_run_at?: string; last_error?: string | null } },
): Promise<number> {
  const admin = createAdminSupabase();
  const BATCH = 100;
  let total = 0;
  const seen = new Set<string>();
  for (let round = 0; round < 1000; round++) {
    let q = admin
      .from("landing_jobs")
      .select("id, landing_registrations!inner(page_id)")
      .in("status", opts.statuses)
      .eq("landing_registrations.page_id", pageId);
    if (opts.type) q = q.eq("type", opts.type);
    const { data, error } = await q.limit(BATCH + seen.size);
    if (error) throw error;
    const ids = ((data ?? []) as { id: string }[]).map((j) => j.id).filter((id) => !seen.has(id)).slice(0, BATCH);
    if (ids.length === 0) break;
    const { data: updated, error: upErr } = await admin
      .from("landing_jobs")
      .update(opts.patch)
      .in("id", ids)
      .in("status", opts.statuses)
      .select("id");
    if (upErr) throw upErr;
    ids.forEach((id) => seen.add(id));
    total += (updated ?? []).length;
    if (ids.length < BATCH) break;
  }
  return total;
}

/**
 * Called after the event sheet is created: every sheet_append job of the page goes back to
 * pending with a fresh budget, including `done` ones that returned early because there was no
 * sheet. Re-appending is safe: Apps Script dedupes on Ref ID + email.
 */
export function requeueSheetAppendJobs(pageId: string): Promise<number> {
  return requeueByPage(pageId, {
    statuses: ["pending", "running", "failed", "done"],
    type: "sheet_append",
    patch: { status: "pending", attempts: 0, next_run_at: new Date().toISOString(), last_error: null },
  });
}

/**
 * Admin Retry: this page's pending jobs become due now. Running jobs are left alone: their
 * 10-minute lease is the lock, and clearing it would let a drain run a live job twice.
 */
export function makeWaitingJobsDue(pageId: string): Promise<number> {
  return requeueByPage(pageId, {
    statuses: ["pending"],
    patch: { next_run_at: new Date().toISOString() },
  });
}
