import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { AudienceContact } from "@/lib/crm/meta-audience";

/**
 * Cohort -> audience contacts for the Meta CSV export.
 *
 * PostgREST caps a read at 1000 rows, so every read is paged with .range()
 * on a stable order, and every .in() list is chunked at 200 ids (the ids go
 * into the GET query string).
 */

export const PAGE_SIZE = 1000;
export const IN_CHUNK = 200;

const SUPPRESSION_EVENTS = ["hard_bounce", "blocked", "spam", "invalid_email", "unsubscribed"];

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }>;

/** Reads every page of a query. `build` must apply a stable, unique ordering. */
export async function pageAll<T>(label: string, build: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} read failed`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type BatchRow = { id: string; sheet_name: string; tab_name: string; kind: string };

export async function loadCohortAudience(
  cohortIds: string[],
): Promise<{ contacts: AudienceContact[]; names: string[] }> {
  const admin = createAdminSupabase();
  const ids = Array.from(new Set(cohortIds));

  const batches: BatchRow[] = [];
  for (const part of chunk(ids)) {
    const { data, error } = await admin
      .from("import_batches")
      .select("id, sheet_name, tab_name, kind")
      .in("id", part);
    if (error) throw new Error("import_batches read failed");
    batches.push(...((data ?? []) as BatchRow[]));
  }
  if (batches.length === 0) return { contacts: [], names: [] };

  const names = batches.map((b) => (b.kind === "imported" ? `${b.sheet_name || "cohort"} ${b.tab_name}`.trim() : b.sheet_name || b.tab_name));
  const purchaseBatchIds = batches.filter((b) => b.kind !== "closed_interested").map((b) => b.id);
  const interestedBatchIds = batches.filter((b) => b.kind === "closed_interested").map((b) => b.id);

  const contactIds = new Set<string>();

  for (const part of chunk(purchaseBatchIds)) {
    const rows = await pageAll<{ contact_id: string }>("contact_purchases", (from, to) =>
      admin
        .from("contact_purchases")
        .select("contact_id")
        .in("import_batch_id", part)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const r of rows) contactIds.add(r.contact_id);
  }

  const interestedIds = new Set<string>();
  for (const part of chunk(interestedBatchIds)) {
    const rows = await pageAll<{ contact_id: string }>("import_batch_contacts", (from, to) =>
      admin
        .from("import_batch_contacts")
        .select("contact_id")
        .in("import_batch_id", part)
        .order("import_batch_id", { ascending: true })
        .order("contact_id", { ascending: true })
        .range(from, to),
    );
    for (const r of rows) interestedIds.add(r.contact_id);
  }

  // Interested = enquired but never bought: drop anyone with ANY purchase.
  const interestedList = Array.from(interestedIds).filter((id) => !contactIds.has(id));
  const buyers = new Set<string>();
  for (const part of chunk(interestedList)) {
    const rows = await pageAll<{ contact_id: string }>("contact_purchases", (from, to) =>
      admin
        .from("contact_purchases")
        .select("contact_id")
        .in("contact_id", part)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const r of rows) buyers.add(r.contact_id);
  }
  for (const id of interestedList) if (!buyers.has(id)) contactIds.add(id);

  const rows: Array<{
    id: string;
    email: string | null;
    phone_e164: string | null;
    full_name: string;
    country: string | null;
    email_unsubscribed_at: string | null;
    whatsapp_unsubscribed_at: string | null;
    do_not_contact_at: string | null;
  }> = [];
  for (const part of chunk(Array.from(contactIds).sort())) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, email, phone_e164, full_name, country, email_unsubscribed_at, whatsapp_unsubscribed_at, do_not_contact_at")
      .in("id", part)
      .order("id", { ascending: true });
    if (error) throw new Error("contacts read failed");
    rows.push(...(data ?? []));
  }

  // Suppression: lower(user_email) match. PostgREST cannot filter on lower(),
  // so fetch with case-insensitive ilike (a superset: "_" is a wildcard) and
  // then compare lowercased values exactly. Smaller chunks: ilike terms are long.
  const suppressed = new Set<string>();
  // Emails with a double quote or backslash cannot go in the or() filter
  // safely, so they fail closed: treated as suppressed.
  const unsafe = (e: string) => /["\\]/.test(e);
  const emails = Array.from(
    new Set(rows.map((r) => r.email?.trim().toLowerCase()).filter((e): e is string => !!e && !unsafe(e))),
  );
  for (const part of chunk(emails, 100)) {
    const orExpr = part.map((e) => `user_email.ilike."${e}"`).join(",");
    const events = await pageAll<{ user_email: string }>("email_metrics", (from, to) =>
      admin
        .from("email_metrics")
        .select("user_email")
        .or(orExpr)
        .in("event_type", SUPPRESSION_EVENTS)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const wanted = new Set(part);
    for (const e of events) {
      const lower = e.user_email.trim().toLowerCase();
      if (wanted.has(lower)) suppressed.add(lower);
    }
  }

  const contacts: AudienceContact[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    phoneE164: r.phone_e164,
    fullName: r.full_name,
    country: r.country,
    emailUnsubscribedAt: r.email_unsubscribed_at,
    whatsappUnsubscribedAt: r.whatsapp_unsubscribed_at,
    doNotContactAt: r.do_not_contact_at,
    emailSuppressed:
      !!r.email && (unsafe(r.email.trim().toLowerCase()) || suppressed.has(r.email.trim().toLowerCase())),
  }));

  return { contacts, names };
}
