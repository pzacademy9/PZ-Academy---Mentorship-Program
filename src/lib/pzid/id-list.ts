// Pure logic for the admin "Student IDs" list: scope, filters, counts, search, copy text.
import { parseOption } from "@/lib/classes/audience";

export type IdRow = { name: string; pzId: string; full: boolean; modules: number[]; known: boolean };
export type IdFilter = "all" | "full" | "unknown" | 1 | 2 | 3 | 4;
export type IdCounts = { all: number; full: number; modular: number; unknown: number; "1": number; "2": number; "3": number; "4": number };

/** One row per person: scope is the union of every registration option label. */
export function rowFromLabels(name: string, pzId: string, labels: string[]): IdRow {
  let full = false;
  const mods = new Set<number>();
  for (const label of labels) {
    const s = parseOption(label);
    if (s.full) full = true;
    for (const n of s.modules) mods.add(n);
  }
  // Only modules 1-4 exist; anything else (a typo such as M12) is not trusted.
  const modules = full ? [] : Array.from(mods).filter((n) => n >= 1 && n <= 4).sort((a, b) => a - b);
  return { name, pzId, full, modules, known: full || modules.length > 0 };
}

export function scopeTag(row: IdRow): string {
  if (row.full) return "Full course";
  if (row.modules.length > 0) return `Module ${row.modules.join(", ")}`;
  return "Scope not set";
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function filterRows(rows: IdRow[], filter: IdFilter, query: string): IdRow[] {
  const q = norm(query);
  return rows.filter((r) => {
    const inScope =
      filter === "all"
        ? true
        : filter === "full"
          ? r.full
          : filter === "unknown"
            ? !r.known
            : !r.full && r.modules.includes(filter);
    if (!inScope) return false;
    return q === "" || norm(r.name).includes(q) || norm(r.pzId).includes(q);
  });
}

export function countByFilter(rows: IdRow[]): IdCounts {
  const c: IdCounts = { all: rows.length, full: 0, modular: 0, unknown: 0, "1": 0, "2": 0, "3": 0, "4": 0 };
  for (const r of rows) {
    if (r.full) {
      c.full += 1;
      continue;
    }
    if (!r.known) {
      c.unknown += 1;
      continue;
    }
    c.modular += 1;
    for (const n of [1, 2, 3, 4] as const) if (r.modules.includes(n)) c[String(n) as "1" | "2" | "3" | "4"] += 1;
  }
  return c;
}

export function copyLines(rows: IdRow[]): string {
  return rows.map((r) => `${r.name} - ${r.pzId}`).join("\n");
}

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}
