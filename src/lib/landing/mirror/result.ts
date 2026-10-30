// Pure and client-safe: no server-only import. Type-only import is erased at build time.
import type { MirrorResult } from "@/lib/data/landing-mirror";

const COUNT_KEYS = ["inserted", "changed", "linked", "skipped"] as const;

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Turns anything (a database value, a reply body) into a safe MirrorResult, or null
 * when it is not recognisable as one. Extra fields (such as lastGood) are dropped.
 */
export function parseMirrorResult(raw: unknown): MirrorResult | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const hasRanAt = typeof r.ranAt === "string";
  const hasCounts = COUNT_KEYS.some((k) => typeof r[k] === "number");
  const error = typeof r.error === "string" ? r.error : undefined;
  let ok: boolean;
  if (typeof r.ok === "boolean") ok = r.ok;
  else if (hasRanAt || hasCounts) ok = error === undefined;
  else return null;

  const problems = Array.isArray(r.problems)
    ? r.problems.flatMap((p) => {
        if (p === null || typeof p !== "object") return [];
        const { rowNumber, reason } = p as Record<string, unknown>;
        return typeof rowNumber === "number" && Number.isFinite(rowNumber) && typeof reason === "string"
          ? [{ rowNumber, reason }]
          : [];
      })
    : [];
  const notes = Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === "string") : [];

  return {
    ok,
    preview: r.preview === true,
    inserted: count(r.inserted),
    changed: count(r.changed),
    linked: count(r.linked),
    skipped: count(r.skipped),
    problems,
    notes,
    ...(error !== undefined ? { error } : {}),
    ranAt: hasRanAt ? (r.ranAt as string) : "",
  };
}
