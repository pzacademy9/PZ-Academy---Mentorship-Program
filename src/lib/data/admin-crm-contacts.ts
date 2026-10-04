import "server-only";
import { carryOverFields } from "@/lib/crm/merge-carryover";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { scoreDuplicate, normalizeName } from "@/lib/crm/identity";
import { normalizePhone } from "@/lib/crm/phone";

/**
 * Contacts read layer plus the duplicate review queue. Mirrors
 * admin-marketing.ts conventions: service-role client, discriminated-union
 * results, no throwing.
 */

export type MutationResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  productLabels: string[];
  unsubscribed: boolean;
};

export type ContactDetail = ContactRow & {
  profession: string | null;
  phoneRaw: string | null;
  hasPlatformAccount: boolean;
  purchases: Array<{
    id: string;
    productLabel: string;
    amount: number | null;
    currency: string | null;
    isEarlyBird: boolean;
    rowType: string;
    promoCode: string | null;
    sourceRowRef: string;
  }>;
};

type RawContactRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  country: string | null;
  discovery_source: string;
  email_unsubscribed_at: string | null;
};

// Matches the .in() chunking on the import path: a page of 200 contact ids is
// ~7KB of UUIDs in a GET URL, close enough to proxy limits to be worth avoiding.
const ID_CHUNK = 100;

const BASE_COLUMNS = "id, full_name, email, phone_e164, country, discovery_source, email_unsubscribed_at";

export async function listContacts(query: {
  search?: string;
  courseName?: string;
  importBatchId?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: ContactRow[]; total: number }> {
  const admin = createAdminSupabase();

  // An inner-joined embed is what turns "all contacts" into "contacts who
  // registered for X". The embedded rows themselves are discarded — labels and
  // counts are read back per page below so they describe ALL of a contact's
  // registrations, not just the ones that matched the filter.
  const filtered = query.courseName !== undefined || query.importBatchId !== undefined;
  const select = filtered ? `${BASE_COLUMNS}, contact_purchases!inner(id)` : BASE_COLUMNS;

  let q = admin
    .from("contacts")
    .select(select, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (query.search && query.search.trim() !== "") {
    const term = `%${query.search.trim()}%`;
    q = q.or(`full_name.ilike.${term},email.ilike.${term},phone_e164.ilike.${term}`);
  }
  if (query.courseName) {
    // A course name is always a prefix of the labels it covers, so one prefix
    // match catches every price/tier/promo variant of that course.
    const pattern = `${query.courseName.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    q = q.ilike("contact_purchases.product_label", pattern);
  }
  if (query.importBatchId) q = q.eq("contact_purchases.import_batch_id", query.importBatchId);

  const { data, count } = await q;
  const contacts = (data ?? []) as unknown as RawContactRow[];

  const labels = await purchaseLabelsByContact(contacts.map((c) => c.id));

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    fullName: c.full_name,
    email: c.email,
    phoneE164: c.phone_e164,
    country: c.country,
    discoverySource: c.discovery_source,
    purchaseCount: labels.get(c.id)?.count ?? 0,
    productLabels: labels.get(c.id)?.labels ?? [],
    unsubscribed: c.email_unsubscribed_at !== null,
  }));

  return { rows, total: count ?? rows.length };
}

/** Every registration a contact has, regardless of what the list was filtered by. */
async function purchaseLabelsByContact(ids: string[]): Promise<Map<string, { labels: string[]; count: number }>> {
  const byContact = new Map<string, { labels: string[]; count: number }>();
  const admin = createAdminSupabase();

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await admin
      .from("contact_purchases")
      .select("contact_id, product_label")
      .in("contact_id", chunk);

    if (error) {
      console.error("[crm-contacts] purchase label read failed:", error);
      continue;
    }

    for (const p of data ?? []) {
      const entry = byContact.get(p.contact_id) ?? { labels: [], count: 0 };
      entry.count += 1;
      const label = (p.product_label ?? "").trim();
      if (label !== "" && !entry.labels.includes(label)) entry.labels.push(label);
      byContact.set(p.contact_id, entry);
    }
  }

  return byContact;
}

export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("contacts")
    .select("id, full_name, email, phone_e164, phone_raw, country, profession, discovery_source, email_unsubscribed_at, profile_id, contact_purchases(id, product_label, amount, currency, is_early_bird, row_type, promo_code, source_row_ref)")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const purchases = Array.isArray(data.contact_purchases) ? data.contact_purchases : [];

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    phoneE164: data.phone_e164,
    phoneRaw: data.phone_raw,
    country: data.country,
    profession: data.profession,
    discoverySource: data.discovery_source,
    unsubscribed: data.email_unsubscribed_at !== null,
    hasPlatformAccount: data.profile_id !== null,
    purchaseCount: purchases.length,
    productLabels: Array.from(new Set(purchases.map((p) => (p.product_label ?? "").trim()).filter((l) => l !== ""))),
    purchases: purchases.map((p) => ({
      id: p.id,
      productLabel: p.product_label,
      amount: p.amount === null ? null : Number(p.amount),
      currency: p.currency,
      isEarlyBird: p.is_early_bird,
      rowType: p.row_type,
      promoCode: p.promo_code,
      sourceRowRef: p.source_row_ref,
    })),
  };
}

export type UpdateContactPhoneResult =
  | { ok: true; phoneE164: string }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict"; ownerName: string | null }
  | { ok: false; reason: "db-error" };

/**
 * Re-normalizes through the same rules the import path uses, so a manual
 * edit and a sheet import can never disagree about what a valid number is.
 * The unique index on phone_e164 is the real duplicate guard: a violation
 * there means this number already belongs to a different contact, reported
 * back as a conflict rather than a generic failure.
 */
export async function updateContactPhone(id: string, phoneRaw: string): Promise<UpdateContactPhoneResult> {
  const parsed = normalizePhone(phoneRaw);
  if (!parsed.ok) return { ok: false, reason: "invalid" };

  const admin = createAdminSupabase();
  const { error, count } = await admin
    .from("contacts")
    .update({ phone_e164: parsed.e164, phone_raw: phoneRaw.trim() }, { count: "exact" })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      const { data: owner } = await admin
        .from("contacts")
        .select("full_name")
        .eq("phone_e164", parsed.e164)
        .neq("id", id)
        .maybeSingle();
      return { ok: false, reason: "conflict", ownerName: owner?.full_name || null };
    }
    console.error("[crm-contacts] updateContactPhone failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!count) return { ok: false, reason: "not-found" };

  return { ok: true, phoneE164: parsed.e164 };
}

/**
 * Rescans for probable duplicates and refreshes the pending review queue.
 *
 * Comparisons are bucketed by normalized name first. A naive all-pairs scan
 * over 3,000 contacts is 4.5 million comparisons; scoreDuplicate requires a
 * name match for every "review" verdict anyway, so bucketing by name loses
 * no candidates and reduces the work to a few comparisons per bucket.
 *
 * Only pending rows are cleared. A candidate a human already merged or
 * rejected stays resolved and is never resurfaced.
 */
export async function rebuildMergeCandidates(): Promise<number> {
  const admin = createAdminSupabase();

  // Paged: a single .select() silently caps at PostgREST's max-rows, and a
  // contact missed here is a duplicate that never surfaces for review. Cap at
  // 20 pages (20k contacts) — far beyond the real list.
  const PAGE = 1000;
  const MAX_PAGES = 20;
  type ContactMini = { id: string; email: string | null; phone_e164: string | null; full_name: string };
  const contacts: ContactMini[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE;
    const { data, count, error } = await admin
      .from("contacts")
      .select("id, email, phone_e164, full_name", { count: "exact" })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[crm-contacts] rebuildMergeCandidates: contact scan failed:", error);
      return 0;
    }
    const rows = (data ?? []) as ContactMini[];
    contacts.push(...rows);
    if (rows.length < PAGE || (count != null && offset + rows.length >= count)) break;
  }

  const buckets = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const key = normalizeName(c.full_name);
    if (key === "") continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  const { data: resolved } = await admin
    .from("merge_candidates")
    .select("contact_a_id, contact_b_id")
    .neq("status", "pending");
  const alreadyDecided = new Set((resolved ?? []).map((r) => [r.contact_a_id, r.contact_b_id].sort().join("|")));

  const found: Array<{ contact_a_id: string; contact_b_id: string; reason: string; confidence: number }> = [];

  // Array.from() around the Map iterator: this repo's tsconfig sets no
  // `target`, so a bare `for...of` over a Map/Set iterator fails tsc (TS2802).
  for (const bucket of Array.from(buckets.values())) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        const verdict = scoreDuplicate(
          { email: a.email, phoneE164: a.phone_e164, fullName: a.full_name },
          { email: b.email, phoneE164: b.phone_e164, fullName: b.full_name },
        );
        if (verdict.kind !== "review") continue;
        const [x, y] = [a.id, b.id].sort();
        if (alreadyDecided.has(`${x}|${y}`)) continue;
        found.push({ contact_a_id: x, contact_b_id: y, reason: verdict.reason, confidence: verdict.confidence });
      }
    }
  }

  const { error: clearError } = await admin.from("merge_candidates").delete().eq("status", "pending");
  if (clearError) {
    console.error("[crm-contacts] rebuildMergeCandidates: could not clear pending queue:", clearError);
    return 0;
  }

  if (found.length > 0) {
    const { error: insertError } = await admin.from("merge_candidates").insert(found);
    if (insertError) {
      // The pending queue was just wiped and the refill failed — report the
      // failure rather than a count that describes a queue that is now empty.
      console.error("[crm-contacts] rebuildMergeCandidates: queue refill failed after clear:", insertError);
      return 0;
    }
  }

  return found.length;
}

export type MergeCandidateRow = {
  id: string;
  reason: string;
  confidence: number;
  a: ContactRow;
  b: ContactRow;
};

export async function listMergeCandidates(): Promise<MergeCandidateRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("merge_candidates")
    .select("id, reason, confidence, contact_a_id, contact_b_id")
    .eq("status", "pending")
    .order("confidence", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.flatMap((r) => [r.contact_a_id, r.contact_b_id])));
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, full_name, email, phone_e164, country, discovery_source, email_unsubscribed_at, contact_purchases(product_label)")
    .in("id", ids);

  const byId = new Map<string, ContactRow>();
  for (const c of contacts ?? []) {
    // What each side registered for is real evidence when judging whether two
    // records are the same person, so it rides along into the review queue.
    const purchases = Array.isArray(c.contact_purchases) ? c.contact_purchases : [];
    byId.set(c.id, {
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phoneE164: c.phone_e164,
      country: c.country,
      discoverySource: c.discovery_source,
      purchaseCount: purchases.length,
      productLabels: Array.from(new Set(purchases.map((p) => (p.product_label ?? "").trim()).filter((l) => l !== ""))),
      unsubscribed: c.email_unsubscribed_at !== null,
    });
  }

  return rows
    .map((r) => {
      const a = byId.get(r.contact_a_id);
      const b = byId.get(r.contact_b_id);
      if (!a || !b) return null;
      return { id: r.id, reason: r.reason, confidence: Number(r.confidence), a, b };
    })
    .filter((r): r is MergeCandidateRow => r !== null);
}

/**
 * Applies or dismisses one review-queue decision.
 *
 * On merge, the OLDER contact is canonical and the newer one's purchases are
 * reattached to it before it is deleted. Oldest-wins keeps the contact whose
 * id other rows are most likely to reference already.
 */
export async function resolveMergeCandidate(
  id: string,
  decision: "merge" | "reject",
  userId: string,
): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: candidate } = await admin
    .from("merge_candidates")
    .select("id, contact_a_id, contact_b_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate) return { ok: false, reason: "not-found" };

  if (decision === "merge") {
    const { data: pair } = await admin
      .from("contacts")
      .select(
        "id, created_at, email, phone_e164, profession, country, profile_id, owner_id, claimed_at, do_not_contact_at, whatsapp_unsubscribed_at",
      )
      .in("id", [candidate.contact_a_id, candidate.contact_b_id])
      .order("created_at", { ascending: true });

    if (!pair || pair.length !== 2) return { ok: false, reason: "not-found" };
    const [keep, drop] = pair;

    // Order matters. If `keep` were updated with `drop`'s email/phone while
    // `drop` still held those values, the unique indexes on contacts.email and
    // contacts.phone_e164 would abort the update with 23505. So: reattach
    // `drop`'s child rows, delete `drop` to free its unique values, and only
    // then gap-fill `keep`.
    const { error: moveError } = await admin
      .from("contact_purchases")
      .update({ contact_id: keep.id })
      .eq("contact_id", drop.id);
    if (moveError) {
      console.error("[crm-contacts] merge: purchase move failed:", moveError);
      return { ok: false, reason: "db-error" };
    }

    // The sales workspace timeline and blocked-send audit rows would be lost
    // (cascade / set null) when `drop` is deleted, so they move too.
    const { error: activityMoveError } = await admin
      .from("contact_activities")
      .update({ contact_id: keep.id })
      .eq("contact_id", drop.id);
    if (activityMoveError) {
      console.error("[crm-contacts] merge: activity move failed:", activityMoveError);
      return { ok: false, reason: "db-error" };
    }

    const { error: blockedMoveError } = await admin
      .from("whatsapp_blocked_attempts")
      .update({ contact_id: keep.id })
      .eq("contact_id", drop.id);
    if (blockedMoveError) {
      console.error("[crm-contacts] merge: blocked-attempt move failed:", blockedMoveError);
      return { ok: false, reason: "db-error" };
    }

    // Opt-outs and ownership are applied BEFORE the delete so a failure here
    // aborts the merge rather than silently dropping a stop request.
    const carry = carryOverFields(keep, drop);
    if (Object.keys(carry).length > 0) {
      const { error: carryError } = await admin.from("contacts").update(carry).eq("id", keep.id);
      if (carryError) {
        console.error("[crm-contacts] merge: carry-over failed:", carryError);
        return { ok: false, reason: "db-error" };
      }
    }

    const { error: deleteError } = await admin.from("contacts").delete().eq("id", drop.id);
    if (deleteError) return { ok: false, reason: "db-error" };

    // Fill the survivor's gaps from the record just deleted, so merging never
    // loses a field the duplicate happened to carry. `drop`'s values were read
    // into `pair` before the delete, so they are still available here.
    const { error: updateError } = await admin
      .from("contacts")
      .update({
        email: keep.email ?? drop.email,
        phone_e164: keep.phone_e164 ?? drop.phone_e164,
        profession: keep.profession ?? drop.profession,
        country: keep.country ?? drop.country,
        profile_id: keep.profile_id ?? drop.profile_id,
      })
      .eq("id", keep.id);
    if (updateError) {
      console.error("[crm-contacts] merge: survivor update failed:", updateError);
      return { ok: false, reason: "db-error" };
    }
  }

  const { error } = await admin
    .from("merge_candidates")
    .update({
      status: decision === "merge" ? "merged" : "rejected",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", id);

  return error ? { ok: false, reason: "db-error" } : { ok: true };
}
