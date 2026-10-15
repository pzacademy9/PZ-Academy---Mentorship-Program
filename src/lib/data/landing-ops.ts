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
export interface PageJobSummary {
  waiting: number;
  failed: number;
  /** Sheet-row jobs of real (non-test) registrations only: what the "Sheet sync" pill reports. */
  sheetWaiting: number;
  sheetFailed: number;
  issues: JobIssue[];
}

const MAX_ISSUES = 50;

interface RegEmbed { page_id: string; ref_id: string | null; name: string; email: string; is_test: boolean }
interface JobRow {
  id: string; type: string; status: string; attempts: number; last_error: string | null; next_run_at: string;
  landing_registrations: RegEmbed | RegEmbed[] | null;
}

/**
 * Unfinished outbox jobs (Sheet row, emails) of one page, for the editor's Registrations card.
 * Jobs are reached through the FK join (as retryFailedJobs does), so no registration-id list is
 * built: nothing is truncated by max_rows and no URL grows with the page's size. Counts are exact
 * head queries. Throws on any read error so the card shows "couldn't load" instead of a false
 * "all synced".
 */
export async function getPageJobSummary(pageId: string): Promise<PageJobSummary | null> {
  const admin = createAdminSupabase();
  const page = await admin.from("landing_pages").select("id").eq("id", pageId).maybeSingle();
  if (page.error) throw page.error;
  if (!page.data) return null;

  const issueSelect = "id, type, status, attempts, last_error, next_run_at, landing_registrations!inner(page_id, ref_id, name, email, is_test)";
  const countSelect = "id, landing_registrations!inner(page_id)";
  const sheetCountSelect = "id, landing_registrations!inner(page_id, is_test)";
  const [failedRes, waitingRes, failedRows, waitingRows, sheetFailedRes, sheetWaitingRes] = await Promise.all([
    admin.from("landing_jobs").select(countSelect, { count: "exact", head: true })
      .eq("landing_registrations.page_id", pageId).eq("status", "failed"),
    admin.from("landing_jobs").select(countSelect, { count: "exact", head: true })
      .eq("landing_registrations.page_id", pageId).in("status", ["pending", "running"]),
    // Failed jobs first, then the rest, each oldest first; 50 of each is enough to fill the list.
    admin.from("landing_jobs").select(issueSelect)
      .eq("landing_registrations.page_id", pageId).eq("status", "failed")
      .order("next_run_at", { ascending: true }).limit(MAX_ISSUES),
    admin.from("landing_jobs").select(issueSelect)
      .eq("landing_registrations.page_id", pageId).in("status", ["pending", "running"])
      .order("next_run_at", { ascending: true }).limit(MAX_ISSUES),
    // The Sheet sync pill counts only Sheet rows of real registrations (not emails, not test runs).
    admin.from("landing_jobs").select(sheetCountSelect, { count: "exact", head: true })
      .eq("landing_registrations.page_id", pageId).eq("landing_registrations.is_test", false)
      .eq("type", "sheet_append").eq("status", "failed"),
    admin.from("landing_jobs").select(sheetCountSelect, { count: "exact", head: true })
      .eq("landing_registrations.page_id", pageId).eq("landing_registrations.is_test", false)
      .eq("type", "sheet_append").in("status", ["pending", "running"]),
  ]);
  if (failedRes.error) throw failedRes.error;
  if (waitingRes.error) throw waitingRes.error;
  if (failedRows.error) throw failedRows.error;
  if (waitingRows.error) throw waitingRows.error;
  if (sheetFailedRes.error) throw sheetFailedRes.error;
  if (sheetWaitingRes.error) throw sheetWaitingRes.error;
  const rows = [...((failedRows.data ?? []) as unknown as JobRow[]), ...((waitingRows.data ?? []) as unknown as JobRow[])].slice(0, MAX_ISSUES);

  const issues: JobIssue[] = rows.map((j) => {
    const r = Array.isArray(j.landing_registrations) ? j.landing_registrations[0] : j.landing_registrations;
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
  return {
    waiting: waitingRes.count ?? 0,
    failed: failedRes.count ?? 0,
    sheetWaiting: sheetWaitingRes.count ?? 0,
    sheetFailed: sheetFailedRes.count ?? 0,
    issues,
  };
}
