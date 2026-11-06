// Who a progress report round goes to. Pure code, shared by the screen and the server.
import { parseOption } from "@/lib/classes/audience";

export type ReportAudience =
  | { kind: "all" }
  | { kind: "full" }
  | { kind: "modules"; modules: number[] };

/** True when one of the student's registrations is in the chosen group. */
export function matchesReportAudience(optionLabels: string[], a: ReportAudience): boolean {
  if (a.kind === "all") return true;
  return optionLabels.some((label) => {
    const o = parseOption(label);
    if (o.mode === "unknown") return false;
    if (a.kind === "full") return o.full;
    return !o.full && o.modules.some((n) => a.modules.includes(n));
  });
}

/** Re-checks an audience that came from the browser. Missing means everyone; anything unreadable is null. */
export function cleanReportAudience(raw: unknown): ReportAudience | null {
  if (raw === undefined || raw === null) return { kind: "all" };
  if (typeof raw !== "object") return null;
  const o = raw as { kind?: unknown; modules?: unknown };
  if (o.kind === "all") return { kind: "all" };
  if (o.kind === "full") return { kind: "full" };
  if (o.kind === "modules" && Array.isArray(o.modules) && o.modules.length > 0 && o.modules.every((n) => Number.isInteger(n) && n >= 1 && n <= 12)) {
    return { kind: "modules", modules: Array.from(new Set(o.modules as number[])).sort((x, y) => x - y) };
  }
  return null;
}

export function describeReportAudience(a: ReportAudience): string {
  if (a.kind === "all") return "everyone in the batch";
  if (a.kind === "full") return "full course students";
  return `students of module ${a.modules.join(", ")}`;
}
