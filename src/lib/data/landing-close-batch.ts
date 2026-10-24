import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { mapRegistrations, type RegRow } from "@/lib/landing/close-batch-rows";

export interface CloseBatchPreview {
  pageTitle: string;
  paid: number;
  interested: number;
  skipped: number;
  alreadyClosed: boolean;
  newPaid: number;
}
export interface CloseBatchResult {
  paidAdded: number;
  interestedAdded: number;
  contactsCreated: number;
  contactsMerged: number;
  skipped: number;
}

const PAGE_SIZE = 1000;
const REG_COLUMNS =
  "id, row_type, lead_registration_id, name, email, whatsapp, profession, discovery, consent, status, expected_amount, currency, promo_code_text, created_at, status_changed_at, is_test";

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

async function readPage(pageId: string): Promise<{ title: string; courseId: string | null }> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("id, title, course_id").eq("id", pageId).maybeSingle();
  check("landing_pages read", error);
  if (!data) throw new Error("Page not found");
  return { title: data.title ?? "", courseId: data.course_id ?? null };
}

/** All registrations of the page, 1000 at a time (PostgREST caps a response at 1000 rows). */
async function readRegistrations(pageId: string): Promise<RegRow[]> {
  const admin = createAdminSupabase();
  const out: RegRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("landing_registrations")
      .select(REG_COLUMNS)
      .eq("page_id", pageId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    check("landing_registrations read", error);
    const rows = (data ?? []) as unknown as RegRow[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Read-only: what closing this batch would do. */
export async function previewCloseBatch(pageId: string): Promise<CloseBatchPreview> {
  const page = await readPage(pageId);
  const mapped = mapRegistrations(await readRegistrations(pageId));
  const admin = createAdminSupabase();
  const sheetId = `landing:${pageId}`;

  const { data: closed, error: cErr } = await admin.from("import_batches").select("id").eq("sheet_id", sheetId).eq("kind", "closed_paid").limit(1);
  check("import_batches read", cErr);

  const known = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("contact_purchases")
      .select("source_row_ref")
      .eq("source_sheet_id", sheetId)
      .order("source_row_ref", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    check("contact_purchases read", error);
    const rows = data ?? [];
    for (const r of rows) known.add(r.source_row_ref as string);
    if (rows.length < PAGE_SIZE) break;
  }

  return {
    pageTitle: page.title,
    paid: mapped.paid,
    interested: mapped.interested,
    skipped: mapped.skipped.length,
    alreadyClosed: (closed ?? []).length > 0,
    newPaid: mapped.rows.filter((r) => r.bucket === "paid" && !known.has(r.rowRef)).length,
  };
}

/** Writes the paid and interested cohorts into the CRM in one database call. */
export async function closeBatch(input: { pageId: string; adminId: string }): Promise<CloseBatchResult> {
  const page = await readPage(input.pageId);
  const mapped = mapRegistrations(await readRegistrations(input.pageId));
  const { data, error } = await createAdminSupabase().rpc("landing_close_batch", {
    p_page_id: input.pageId,
    p_page_title: page.title,
    p_course_id: page.courseId,
    p_created_by: input.adminId,
    p_rows: mapped.rows,
  } as never);
  check("landing_close_batch", error);
  const r = (data ?? {}) as Record<string, number>;
  return {
    paidAdded: r.paid_added ?? 0,
    interestedAdded: r.interested_added ?? 0,
    contactsCreated: r.contacts_created ?? 0,
    contactsMerged: r.contacts_merged ?? 0,
    skipped: mapped.skipped.length,
  };
}
