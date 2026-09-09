import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildSegmentFilters, type SegmentFilter, type QueryOp } from "@/lib/crm/segment";

export type SegmentContact = {
  id: string;
  fullName: string;
  email: string;
  unsubscribeToken: string;
};

type Query = ReturnType<ReturnType<typeof createAdminSupabase>["from"]>["select"] extends (...a: never[]) => infer R ? R : never;

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

/**
 * Resolves a segment to the contacts it matches.
 *
 * `limit` exists so the builder UI can show a sample without pulling the
 * whole list; the send path calls this with no limit and snapshots whatever
 * comes back.
 */
export async function resolveSegment(
  filters: SegmentFilter[],
  opts?: { limit?: number },
): Promise<{ contacts: SegmentContact[]; total: number }> {
  const admin = createAdminSupabase();
  const ops = buildSegmentFilters(filters);

  let query = admin
    .from("crm_contact_segment_source")
    .select("id, full_name, email, unsubscribe_token", { count: "exact" });

  for (const op of ops) query = applyOp(query, op);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, count, error } = await query;
  if (error) {
    console.error("[crm-segments] resolve failed:", error);
    return { contacts: [], total: 0 };
  }

  const contacts: SegmentContact[] = (data ?? [])
    // is_sendable already guarantees a non-null email; this narrows the type.
    // id and unsubscribe_token are non-null for any real contact row — the view
    // types them nullable only because it is a view, so narrow them here too.
    .filter(
      (r): r is typeof r & { id: string; email: string; unsubscribe_token: string } =>
        r.id !== null && r.email !== null && r.unsubscribe_token !== null,
    )
    .map((r) => ({
      id: r.id,
      fullName: r.full_name ?? "",
      email: r.email,
      unsubscribeToken: r.unsubscribe_token,
    }));

  return { contacts, total: count ?? contacts.length };
}

export async function countSegment(filters: SegmentFilter[]): Promise<number> {
  const { total } = await resolveSegment(filters, { limit: 1 });
  return total;
}
