import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { JobType } from "@/lib/data/landing-jobs";

export interface JobIssue {
  id: string;
  type: JobType;
  status: "pending" | "running" | "failed";
  attempts: number;
  lastError: string | null;
  nextRunAt: string;
  refId: string | null;
  name: string;
  email: string;
  isTest: boolean;
}
export interface PageJobSummary { waiting: number; failed: number; issues: JobIssue[] }

const MAX_ISSUES = 50;
const CHUNK = 200;

interface RegRow { id: string; ref_id: string | null; name: string; email: string; is_test: boolean }
interface JobRow { id: string; registration_id: string; type: string; status: string; attempts: number; last_error: string | null; next_run_at: string }

/**
 * Unfinished outbox jobs (Sheet row, emails) of one page, for the editor's Registrations card.
 * Jobs hang off the lead/individual row (members never get their own jobs). Throws on a read
 * error so the card shows "couldn't load" instead of a false "all synced".
 */
export async function getPageJobSummary(pageId: string): Promise<PageJobSummary | null> {
  const admin = createAdminSupabase();
  const page = await admin.from("landing_pages").select("id").eq("id", pageId).maybeSingle();
  if (page.error) throw page.error;
  if (!page.data) return null;

  const { data: regData, error: regError } = await admin
    .from("landing_registrations")
    .select("id, ref_id, name, email, is_test")
    .eq("page_id", pageId)
    .in("row_type", ["individual", "lead"]);
  if (regError) throw regError;
  const regs = new Map(((regData ?? []) as RegRow[]).map((r) => [r.id, r]));
  const ids = Array.from(regs.keys());

  const jobs: JobRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from("landing_jobs")
      .select("id, registration_id, type, status, attempts, last_error, next_run_at")
      .in("registration_id", ids.slice(i, i + CHUNK))
      .in("status", ["pending", "running", "failed"]);
    if (error) throw error;
    jobs.push(...((data ?? []) as JobRow[]));
  }

  const failed = jobs.filter((j) => j.status === "failed").length;
  const issues: JobIssue[] = jobs
    .slice()
    .sort((a, b) => {
      const fa = a.status === "failed" ? 0 : 1;
      const fb = b.status === "failed" ? 0 : 1;
      return fa - fb || a.next_run_at.localeCompare(b.next_run_at);
    })
    .slice(0, MAX_ISSUES)
    .map((j) => {
      const r = regs.get(j.registration_id);
      return {
        id: j.id,
        type: j.type as JobType,
        status: j.status as JobIssue["status"],
        attempts: j.attempts,
        lastError: j.last_error,
        nextRunAt: j.next_run_at,
        refId: r?.ref_id ?? null,
        name: r?.name ?? "",
        email: r?.email ?? "",
        isTest: r?.is_test ?? false,
      };
    });
  return { waiting: jobs.length - failed, failed, issues };
}
