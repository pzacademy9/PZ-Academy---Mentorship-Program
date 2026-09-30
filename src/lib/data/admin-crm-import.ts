import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listSheetTabs, readAllSheetRows, extractSheetId, type SheetTabsResult } from "@/lib/gas/sheets-read-client";
import { guessColumnMapping, parseSheetRow, type ColumnMapping, type ParsedRow } from "@/lib/crm/import-mapping";
import type { ImportPreviewInput, ImportCommitInput } from "@/lib/validations/crm";

/**
 * Import data layer. Mirrors admin-marketing.ts: service-role client,
 * discriminated-union results instead of throwing.
 *
 * The dry run and the commit share one parse path deliberately. If preview
 * and commit could diverge, the preview would stop being a guarantee and
 * become a suggestion — which is worse than no preview at all, because it
 * would be trusted.
 */

export type ImportPreview = {
  rowsTotal: number;
  rowsImportable: number;
  rowsSkipped: number;
  contactsNew: number;
  contactsExisting: number;
  phoneFailures: number;
  productLabels: string[];
  samples: Array<{ rowRef: string; name: string; email: string | null; phone: string | null; product: string; rowType: string }>;
};

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; message: string };
export type CommitResult =
  | { ok: true; batchId: string; rowsImported: number; contactsCreated: number; contactsMerged: number }
  | { ok: false; message: string };

export async function getSheetTabs(sheetIdOrUrl: string): Promise<SheetTabsResult> {
  const sheetId = extractSheetId(sheetIdOrUrl);
  if (!sheetId) return { ok: false, message: "That does not look like a Google Sheets URL or ID." };
  return listSheetTabs(sheetId);
}

export type ImportBatchOption = {
  id: string;
  sheetName: string;
  tabName: string;
  rowsImported: number;
  createdAt: string;
};

/** Feeds the segment builder's batch picker — labels instead of raw UUIDs. */
export async function listImportBatches(): Promise<ImportBatchOption[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("import_batches")
    .select("id, sheet_name, tab_name, rows_imported, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    sheetName: b.sheet_name || "(untitled sheet)",
    tabName: b.tab_name,
    rowsImported: b.rows_imported,
    createdAt: b.created_at,
  }));
}

export type CohortRow = {
  id: string;
  sheetName: string;
  tabName: string;
  rowsImported: number;
  createdAt: string;
  courseId: string | null;
  courseTitle: string | null;
  purchaseCount: number;
};

/**
 * Feeds the Cohorts tab. Unlike listImportBatches, this counts purchases
 * still attached to each batch live — a batch's stored rows_imported is a
 * snapshot from commit time and goes stale once contact_purchases.import_batch_id
 * is reassigned (e.g. by a later commit's upsert) or a batch is deleted.
 */
export async function listCohorts(): Promise<CohortRow[]> {
  const admin = createAdminSupabase();
  const [{ data: batches }, { data: purchases }] = await Promise.all([
    admin
      .from("import_batches")
      .select("id, sheet_name, tab_name, rows_imported, created_at, course_id, courses(title)")
      .order("created_at", { ascending: false }),
    admin.from("contact_purchases").select("import_batch_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of purchases ?? []) {
    if (p.import_batch_id) counts.set(p.import_batch_id, (counts.get(p.import_batch_id) ?? 0) + 1);
  }

  return (batches ?? []).map((b) => ({
    id: b.id,
    sheetName: b.sheet_name || "(untitled sheet)",
    tabName: b.tab_name,
    rowsImported: b.rows_imported,
    createdAt: b.created_at,
    courseId: b.course_id,
    courseTitle: (b.courses as { title: string } | null)?.title ?? null,
    purchaseCount: counts.get(b.id) ?? 0,
  }));
}

export type CohortContactRow = {
  contactId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  productLabel: string;
};

export type CohortDetail = CohortRow & { contacts: CohortContactRow[] };

/** Feeds the Cohort detail page — every purchase this sheet import produced, joined back to its contact. */
export async function getCohortDetail(id: string): Promise<CohortDetail | null> {
  const admin = createAdminSupabase();
  const { data: batch } = await admin
    .from("import_batches")
    .select("id, sheet_name, tab_name, rows_imported, created_at, course_id, courses(title)")
    .eq("id", id)
    .maybeSingle();
  if (!batch) return null;

  const { data: purchases } = await admin
    .from("contact_purchases")
    .select("contact_id, product_label, contacts(full_name, email, phone_e164)")
    .eq("import_batch_id", id);

  const rows = purchases ?? [];
  const contacts: CohortContactRow[] = rows.map((p) => {
    const contact = p.contacts as { full_name: string; email: string | null; phone_e164: string | null } | null;
    return {
      contactId: p.contact_id,
      fullName: contact?.full_name ?? "",
      email: contact?.email ?? null,
      phoneE164: contact?.phone_e164 ?? null,
      productLabel: p.product_label,
    };
  });

  return {
    id: batch.id,
    sheetName: batch.sheet_name || "(untitled sheet)",
    tabName: batch.tab_name,
    rowsImported: batch.rows_imported,
    createdAt: batch.created_at,
    courseId: batch.course_id,
    courseTitle: (batch.courses as { title: string } | null)?.title ?? null,
    purchaseCount: rows.length,
    contacts,
  };
}

export type DeleteCohortResult = { ok: true } | { ok: false; reason: "not-found" | "error" };

/**
 * Detaches the batch label only — import_batches.id is ON DELETE SET NULL
 * on contact_purchases.import_batch_id, so purchases and contacts survive;
 * they just lose their cohort tag.
 */
export async function deleteImportBatch(id: string): Promise<DeleteCohortResult> {
  const admin = createAdminSupabase();
  const { error, count } = await admin.from("import_batches").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, reason: "error" };
  if (!count) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export type CourseOption = { id: string; title: string; type: string };

/**
 * Feeds the import wizard's course picker. Deliberately unfiltered by
 * is_published — a course tagged here may be a draft row that exists only
 * to label historical CRM data (see migration 0051), and it must stay
 * pickable even though it will never appear in the public catalog.
 */
export async function listCoursesForTagging(): Promise<CourseOption[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("courses").select("id, title, type").order("title");
  if (error) {
    console.error("[crm-import] listCoursesForTagging failed:", error);
    throw new Error("Could not load courses");
  }
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, type: c.type }));
}

export { guessColumnMapping };

/** Parses every row once, and reports what a commit would do. Writes nothing. */
async function parseAll(
  sheetIdOrUrl: string,
  tabName: string,
  mapping: ColumnMapping,
): Promise<{ ok: true; sheetId: string; parsed: ParsedRow[] } | { ok: false; message: string }> {
  const sheetId = extractSheetId(sheetIdOrUrl);
  if (!sheetId) return { ok: false, message: "That does not look like a Google Sheets URL or ID." };

  const read = await readAllSheetRows(sheetId, tabName);
  if (!read.ok) return { ok: false, message: read.message };

  const parsed = read.rows.map((row, index) => parseSheetRow(row, mapping, index, tabName));
  return { ok: true, sheetId, parsed };
}

export async function previewImport(input: ImportPreviewInput): Promise<PreviewResult> {
  const result = await parseAll(input.sheetId, input.tabName, input.mapping);
  if (!result.ok) return result;

  const importable = result.parsed.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok);
  const skipped = result.parsed.length - importable.length;

  // Which of these people the database already knows, resolved in two bulk
  // queries rather than one per row — 3,000 round trips would take minutes.
  const emails = importable.map((r) => r.contact.email).filter((e): e is string => e !== null);
  const phones = importable.map((r) => r.contact.phoneE164).filter((p): p is string => p !== null);

  const admin = createAdminSupabase();
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();

  // Chunked at 100: every value goes into the GET query string, and a sheet
  // with thousands of rows would blow past the URL length limit or silently
  // truncate. A chunk error is fatal — treating everyone as new would let a
  // re-import look like a first import.
  const CHUNK = 100;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const { data, error } = await admin.from("contacts").select("email").in("email", emails.slice(i, i + CHUNK));
    if (error) return { ok: false, message: "Could not check for existing contacts — try again." };
    for (const row of data ?? []) if (row.email) existingEmails.add(row.email);
  }
  for (let i = 0; i < phones.length; i += CHUNK) {
    const { data, error } = await admin.from("contacts").select("phone_e164").in("phone_e164", phones.slice(i, i + CHUNK));
    if (error) return { ok: false, message: "Could not check for existing contacts — try again." };
    for (const row of data ?? []) if (row.phone_e164) existingPhones.add(row.phone_e164);
  }

  // Deduplicate within the sheet itself as well: the same person appearing
  // twice in one tab must count as one new contact, not two.
  const seen = new Set<string>();
  let contactsNew = 0;
  let contactsExisting = 0;

  for (const row of importable) {
    const key = row.contact.email ?? row.contact.phoneE164 ?? row.rowRef;
    if (seen.has(key)) continue;
    seen.add(key);

    const known =
      (row.contact.email !== null && existingEmails.has(row.contact.email)) ||
      (row.contact.phoneE164 !== null && existingPhones.has(row.contact.phoneE164));

    if (known) contactsExisting += 1;
    else contactsNew += 1;
  }

  const phoneFailures = importable.filter((r) => r.contact.phoneE164 === null).length;
  const productLabels = Array.from(new Set(importable.map((r) => r.purchase.productLabel).filter((l) => l !== ""))).sort();

  return {
    ok: true,
    preview: {
      rowsTotal: result.parsed.length,
      rowsImportable: importable.length,
      rowsSkipped: skipped,
      contactsNew,
      contactsExisting,
      phoneFailures,
      productLabels,
      samples: importable.slice(0, 10).map((r) => ({
        rowRef: r.rowRef,
        name: r.contact.fullName,
        email: r.contact.email,
        phone: r.contact.phoneE164,
        product: r.purchase.productLabel,
        rowType: r.purchase.rowType,
      })),
    },
  };
}

export async function commitImport(userId: string, input: ImportCommitInput): Promise<CommitResult> {
  const result = await parseAll(input.sheetId, input.tabName, input.mapping);
  if (!result.ok) return result;

  const rows = result.parsed
    .filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok)
    .map((r) => ({ rowRef: r.rowRef, contact: r.contact, purchase: r.purchase }));

  if (rows.length === 0) {
    return { ok: false, message: "No importable rows — check the column mapping." };
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("crm_import_commit", {
    p_sheet_id: result.sheetId,
    p_sheet_name: input.sheetName,
    p_tab_name: input.tabName,
    p_column_mapping: input.mapping,
    p_course_id: input.courseId ?? null,
    p_created_by: userId,
    p_rows: rows,
  });

  if (error) {
    console.error("[crm-import] commit failed:", error);
    return { ok: false, message: "The import failed and nothing was saved." };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    batchId: String(summary.batch_id ?? ""),
    rowsImported: Number(summary.rows_imported ?? 0),
    contactsCreated: Number(summary.contacts_created ?? 0),
    contactsMerged: Number(summary.contacts_merged ?? 0),
  };
}
