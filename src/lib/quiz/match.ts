// src/lib/quiz/match.ts
// Kahoot player text -> person. Exact ID/alias match always wins; only if there is none,
// trailing "n" characters (a rejoin: Kahoot blocks a reused nickname) are stripped and the
// match retried once. Nothing else is guessed.
import { normalizePzId } from "@/lib/pzid/format";

/** alias_norm -> person_id */
export type AliasMap = Map<string, string>;

export type Match =
  | { kind: "exact"; personId: string }
  | { kind: "rejoin"; personId: string; stripped: number }
  | { kind: "unknown" };

export function matchPlayer(raw: string, aliases: AliasMap): Match {
  const norm = normalizePzId(raw);
  if (norm === "") return { kind: "unknown" };
  const exact = aliases.get(norm);
  if (exact) return { kind: "exact", personId: exact };

  // Strip trailing n's one at a time, so an alias that itself ends in n is still reachable.
  const trailing = norm.length - norm.replace(/n+$/, "").length;
  for (let k = 1; k <= trailing && k < norm.length; k++) {
    const personId = aliases.get(norm.slice(0, norm.length - k));
    if (personId) return { kind: "rejoin", personId, stripped: k };
  }
  return { kind: "unknown" };
}
