import "server-only";

export interface FamilyListed {
  id: string;
  family_id?: string | null;
  /** A batch portal carries a batch label (for example "3"). */
  batch_label?: string | null;
  created_at?: string | null;
}

/**
 * Website listing rule for batch portals: a course with a batch label is a batch
 * portal and is never listed (its students reach it through the portal link).
 * Of the other published courses that share a family, only the newest (greatest
 * created_at, then greatest id) is kept. Courses with no family are always kept.
 * Input order is preserved.
 */
export function pickLatestPerFamily<T extends FamilyListed>(all: T[]): T[] {
  const rows = all.filter((r) => (r.batch_label ?? "").trim() === "");
  const newest = new Map<string, T>();
  for (const r of rows) {
    if (!r.family_id) continue;
    const cur = newest.get(r.family_id);
    if (!cur || isNewer(r, cur)) newest.set(r.family_id, r);
  }
  return rows.filter((r) => !r.family_id || newest.get(r.family_id) === r);
}

function isNewer(a: FamilyListed, b: FamilyListed): boolean {
  const ta = a.created_at ?? "";
  const tb = b.created_at ?? "";
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}
