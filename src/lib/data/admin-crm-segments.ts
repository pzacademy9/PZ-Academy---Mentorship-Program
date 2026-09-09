import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildSegmentFilters, type SegmentFilter, type QueryOp } from "@/lib/crm/segment";

export type SegmentContact = {
  id: string;
  fullName: string;
  email: string;
  unsubscribeToken: string;
};

export type SegmentResult =
  | { ok: true; contacts: SegmentContact[]; total: number }
  | { ok: false };

type RawRow = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  unsubscribe_token: string | null;
};

/** Applies one QueryOp to a PostgREST query builder. */
function applyOp<T extends { eq: unknown }>(query: T, op: QueryOp): T {
  // The `as never` casts keep this generic over PostgREST's chained builder
  // types, which do not expose a single shared interface.
  const q = query as unknown as Record<string, (...args: never[]) => T>;
  switch (op.kind) {
    case "overlaps":
      return q.overlaps(op.column as never, op.values as never);
    case "contains":
      return q.contains(op.column as never, op.values as never);
    case "in":
      return q.in(op.column as never, op.values as never);
    case "ilike":
      return q.ilike(op.column as never, op.pattern as never);
    default:
      return q[op.kind](op.column as never, op.value as never);
  }
}

const PAGE = 1000;
// 20k rows is far beyond any real campaign segment. Hitting this cap means a
// filter is wrong or missing — sendCampaign turns a short read into a refusal
// to send rather than a silent partial delivery.
const MAX_PAGES = 20;

/**
 * Resolves a segment to the contacts it matches.
 *
 * `limit` exists so the builder UI can show a sample without pulling the
 * whole list. With no limit the full match set is paged in — a single
 * `.select()` silently caps at PostgREST's max-rows and a large segment
 * would then under-send with no error.
 *
 * Returns a discriminated result so a query error is distinguishable from a
 * genuinely empty segment: `{ ok: false }` is a database failure, an empty
 * `contacts` with `ok: true` is "nobody matched".
 */
export async function resolveSegment(
  filters: SegmentFilter[],
  opts?: { limit?: number },
): Promise<SegmentResult> {
  const admin = createAdminSupabase();
  const ops = buildSegmentFilters(filters);

  const build = () => {
    let query = admin
      .from("crm_contact_segment_source")
      .select("id, full_name, email, unsubscribe_token", { count: "exact" });
    for (const op of ops) query = applyOp(query, op);
    // Stable order so paged .range() reads below cannot skip or duplicate a row.
    return query.order("id", { ascending: true });
  };

  const rawRows: RawRow[] = [];
  let total = 0;

  if (opts?.limit) {
    const { data, count, error } = await build().limit(opts.limit);
    if (error) {
      console.error("[crm-segments] resolve failed:", error);
      return { ok: false };
    }
    rawRows.push(...((data ?? []) as RawRow[]));
    total = count ?? rawRows.length;
  } else {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { data, count, error } = await build().range(offset, offset + PAGE - 1);
      if (error) {
        console.error("[crm-segments] resolve failed:", error);
        return { ok: false };
      }
      const rows = (data ?? []) as RawRow[];
      rawRows.push(...rows);
      if (count != null) total = count;
      if (rows.length < PAGE || offset + rows.length >= total) break;
    }
  }

  const contacts: SegmentContact[] = rawRows
    // is_sendable already guarantees a non-null email; this narrows the type.
    // id and unsubscribe_token are non-null for any real contact row — the view
    // types them nullable only because it is a view, so narrow them here too.
    .filter(
      (r): r is RawRow & { id: string; email: string; unsubscribe_token: string } =>
        r.id !== null && r.email !== null && r.unsubscribe_token !== null,
    )
    .map((r) => ({
      id: r.id,
      fullName: r.full_name ?? "",
      email: r.email,
      unsubscribeToken: r.unsubscribe_token,
    }));

  return { ok: true, contacts, total };
}

export async function countSegment(filters: SegmentFilter[]): Promise<number> {
  const result = await resolveSegment(filters, { limit: 1 });
  return result.ok ? result.total : 0;
}
