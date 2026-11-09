// Who a progress report round goes to. Pure code, shared by the screen and the server.
// Two picks: the TYPE (live / recorded / both) and the COURSE PART (everyone / full course / chosen modules).
import { parseOption } from "@/lib/classes/audience";

export type ReportWho = "live" | "recorded" | "both";
export type ReportPart =
  | { kind: "all" }
  | { kind: "full" }
  // withFull: full course students also take every module, so they are included unless the admin says "module only".
  | { kind: "modules"; modules: number[]; withFull: boolean };
export type ReportAudience = { who: ReportWho; part: ReportPart };

/** True when ONE of the student's registrations matches both the type and the course part. */
export function matchesReportAudience(optionLabels: string[], a: ReportAudience): boolean {
  // Everyone, both types: nobody is left out, even with an unreadable label.
  if (a.who === "both" && a.part.kind === "all") return true;
  const part = a.part;
  return optionLabels.some((label) => {
    const o = parseOption(label);
    if (o.mode === "unknown") return false;
    if (a.who !== "both" && o.mode !== a.who) return false;
    if (part.kind === "all") return true;
    if (part.kind === "full") return o.full;
    if (o.full) return part.withFull;
    return o.modules.some((n) => part.modules.includes(n));
  });
}

/**
 * The people a round goes to: one row per person AND per inbox, so nobody is emailed twice.
 * The screen count and the real send both use this, so the number on screen is the number sent.
 */
export function pickReportRecipients<T extends { personId: string; email: string; labels: string[] }>(students: T[], a: ReportAudience): T[] {
  const seenPeople = new Set<string>();
  const seenInboxes = new Set<string>();
  const out: T[] = [];
  for (const s of students) {
    const inbox = (s.email ?? "").trim().toLowerCase();
    if (inbox === "" || seenPeople.has(s.personId) || seenInboxes.has(inbox)) continue;
    if (!matchesReportAudience(s.labels, a)) continue;
    seenPeople.add(s.personId);
    seenInboxes.add(inbox);
    out.push(s);
  }
  return out;
}

/** Re-checks an audience that came from the browser. Missing means everyone; anything unreadable is null. */
export function cleanReportAudience(raw: unknown): ReportAudience | null {
  if (raw === undefined || raw === null) return { who: "both", part: { kind: "all" } };
  if (typeof raw !== "object") return null;
  const o = raw as { who?: unknown; part?: unknown };
  if (o.who !== "live" && o.who !== "recorded" && o.who !== "both") return null;
  if (!o.part || typeof o.part !== "object") return null;
  const p = o.part as { kind?: unknown; modules?: unknown; withFull?: unknown };
  if (p.kind === "all") return { who: o.who, part: { kind: "all" } };
  if (p.kind === "full") return { who: o.who, part: { kind: "full" } };
  if (p.kind === "modules" && typeof p.withFull === "boolean" && Array.isArray(p.modules) && p.modules.length > 0 && p.modules.every((n) => Number.isInteger(n) && n >= 1 && n <= 12)) {
    return { who: o.who, part: { kind: "modules", modules: Array.from(new Set(p.modules as number[])).sort((x, y) => x - y), withFull: p.withFull } };
  }
  return null;
}

export function describeReportAudience(a: ReportAudience): string {
  const type = a.who === "both" ? "" : `${a.who} `;
  if (a.part.kind === "all") return a.who === "both" ? "everyone in the batch" : `all ${a.who} students`;
  if (a.part.kind === "full") return `${type}full course students`;
  const mods = `module ${a.part.modules.join(", ")}`;
  return a.part.withFull ? `${type}students of ${mods}, plus full course students` : `${type}students of ${mods} only, not full course`;
}
