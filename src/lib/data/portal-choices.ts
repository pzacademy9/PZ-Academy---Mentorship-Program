import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PortalError } from "@/lib/data/portal-errors";
import { normalizeContent } from "@/lib/landing/content";
import { suggestOptions, type ChoiceOption } from "@/lib/landing/registration/match-choice";
import type { ChoiceGroup, ChoiceOverview } from "@/lib/landing/registration/choice-types";
import { enqueueEnrollmentSync, runJobsDirect } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/**
 * The page's purchase options, or null for an unknown page. Prefers the published registration
 * config and falls back to the draft (a page may not be published yet), like the Registration setup.
 * Exported so the sheet mirror can read the options the same way.
 */
export async function getPageChoiceOptions(pageId: string): Promise<ChoiceOption[] | null> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("id, draft, published").eq("id", pageId).maybeSingle();
  check("landing_pages read", error);
  if (!data) return null;
  const page = data as unknown as { draft: unknown; published: unknown };
  const content = normalizeContent(page.published ? page.published : page.draft);
  return content.registration.options.map((o) => ({ key: o.key, label: o.label, kind: o.kind, moduleIds: o.moduleIds ?? [] }));
}

const READ_SIZE = 1000;

/** Unmatched purchase labels on a page (paid or not, members included), grouped by label; a label seen in both modes shows as mixed. */
export async function listChoiceGroups(pageId: string): Promise<ChoiceOverview> {
  const options = await getPageChoiceOptions(pageId);
  if (!options) throw new PortalError("That registration page was not found.", 404);

  const admin = createAdminSupabase();
  const groups = new Map<string, ChoiceGroup>();
  for (let from = 0; ; from += READ_SIZE) {
    const { data, error } = await admin
      .from("landing_registrations")
      .select("id, option_label, mode, option_keys, status, is_test")
      .eq("page_id", pageId)
      .order("id", { ascending: true })
      .range(from, from + READ_SIZE - 1);
    check("landing_registrations read", error);
    const rows = (data ?? []) as unknown as { option_label: string | null; mode: string | null; option_keys: string[] | null; status: string; is_test: boolean }[];
    for (const r of rows) {
      const label = r.option_label ?? "";
      if (label.trim() === "" || (r.option_keys ?? []).length > 0) continue;
      const mode = r.mode === "live" || r.mode === "recorded" ? r.mode : null;
      let g = groups.get(label);
      if (!g) {
        const s = suggestOptions(label, options);
        g = { label, mode, count: 0, paidCount: 0, suggestedKeys: s.keys, confident: s.confident };
        groups.set(label, g);
      } else if (g.mode !== mode) {
        g.mode = "mixed";
      }
      g.count += 1;
      if (r.status === "paid" && !r.is_test) g.paidCount += 1;
    }
    if (rows.length < READ_SIZE) break;
  }
  const list = Array.from(groups.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { hasOptions: options.length > 0, options, groups: list };
}

/**
 * Records the chosen options on every row of this page with exactly this label and no choice yet, then
 * queues enrollment for the Paid ones holding those options (which releases the safety hold). Only the enrollment_sync job is run (never other jobs), so nobody is emailed.
 * Running it again changes no rows and safely re-queues (retry).
 */
export async function applyChoice(p: { pageId: string; label: string; optionKeys: string[] }): Promise<{ updated: number; queued: number }> {
  const keys = Array.from(new Set(p.optionKeys.map((k) => k.trim()).filter((k) => k !== "")));
  if (keys.length === 0) throw new PortalError("Pick what they bought first.", 400);
  const options = await getPageChoiceOptions(p.pageId);
  if (!options) throw new PortalError("That registration page was not found.", 404);
  if (options.length === 0) throw new PortalError("This page has nothing to buy yet. Add the options in Registration setup first.", 409);
  const known = new Set(options.map((o) => o.key));
  if (keys.some((k) => !known.has(k))) throw new PortalError("One of those choices is not an option on this page.", 409);
  if (options.some((o) => keys.includes(o.key) && o.kind === "module" && o.moduleIds.length === 0)) {
    throw new PortalError("That option has no module ticked. Tick its module in Registration setup first.", 409);
  }

  const { data, error } = await createAdminSupabase()
    .from("landing_registrations")
    .update({ option_keys: keys } as never)
    .eq("page_id", p.pageId)
    .eq("option_label", p.label)
    .eq("option_keys", "{}" as never)
    .select("id, status, is_test");
  check("landing_registrations update", error);
  const updatedRows = (data ?? []) as unknown as { id: string; status: string; is_test: boolean }[];

  // Queue for every Paid, non-test row of this label that holds exactly these keys, not only the rows
  // just changed: enqueueEnrollmentSync is an upsert, so a repeat Apply safely retries a failed queue step.
  const same = new Set(keys);
  const paidIds: string[] = [];
  for (let from = 0; ; from += READ_SIZE) {
    const { data: page, error: re } = await createAdminSupabase()
      .from("landing_registrations")
      .select("id, option_keys")
      .eq("page_id", p.pageId)
      .eq("option_label", p.label)
      .eq("status", "paid")
      .eq("is_test", false)
      .order("id", { ascending: true })
      .range(from, from + READ_SIZE - 1);
    check("landing_registrations read", re);
    const rows = (page ?? []) as unknown as { id: string; option_keys: string[] | null }[];
    for (const r of rows) {
      const k = r.option_keys ?? [];
      if (k.length === same.size && k.every((x) => same.has(x))) paidIds.push(r.id);
    }
    if (rows.length < READ_SIZE) break;
  }
  let queued = 0;
  for (const id of paidIds) {
    try {
      const ok = await enqueueEnrollmentSync(id);
      if (ok) queued += 1;
      // Only the enrollment job runs here: runJobsFor would also run any other due job (maybe an email).
      runInBackground(runJobsDirect(id, ["enrollment_sync"]));
    } catch (e) {
      console.error(`[portal-choices] enrollment queue failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
      // this row is retried by the next Apply or the next status change; keep going with the others
    }
  }
  return { updated: updatedRows.length, queued };
}
