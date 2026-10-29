// Pure summaries for a batch: combined feedback and attendance. No server-only imports.
import { meetsMinimum } from "@/lib/attendance/rules";
import type { GridRow } from "@/lib/data/attendance";

export type FeedbackPerClass = { number: number; responses: number; avg: number | null };

export function summarizeFeedback(perClass: FeedbackPerClass[]): {
  totalResponses: number;
  overallAvg: number | null;
  perClass: FeedbackPerClass[];
} {
  let total = 0;
  let weighted = 0;
  for (const c of perClass) {
    if (c.responses > 0 && c.avg !== null && Number.isFinite(c.avg)) {
      total += c.responses;
      weighted += c.responses * c.avg;
    }
  }
  return { totalResponses: total, overallAvg: total > 0 ? weighted / total : null, perClass };
}

export function summarizeAttendance(
  rows: GridRow[],
  minPct: number,
): { averagePct: number | null; meetingMin: number; total: number } {
  const pcts = rows.flatMap((r) => (r.pct === null ? [] : [r.pct]));
  const averagePct = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  return { averagePct, meetingMin: rows.filter((r) => meetsMinimum(r.pct, minPct)).length, total: rows.length };
}
