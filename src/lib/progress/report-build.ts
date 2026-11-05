// src/lib/progress/report-build.ts
// Pure builder for the per-student progress report email (the old Apps Script "performance report",
// rebuilt on app data). Ranks come from buildPortalBatch, so the email always matches the website:
// live students only are ranked; recorded students get their own totals but no rank.
import {
  buildPortalBatch,
  publicName,
  type PortalBatchInput,
  type PortalResultRow,
} from "@/lib/progress/portal-build";

export type ReportQuizRow = { sessionId: string; personId: string; score: number; correct: number; incorrect: number };

export type ReportInput = Omit<PortalBatchInput, "scores"> & {
  quiz: ReportQuizRow[];
  /** The email each person registered for this batch with (one per person). */
  emails: Record<string, string>;
};

export type ReportClass = {
  number: number;
  title: string;
  attempted: boolean;
  rank: number | null;
  score: number;
  correct: number;
  incorrect: number;
};

export type ReportTopRow = { rank: number; name: string; score: number; isMe: boolean };

/** What the "how to climb" card says. */
export type ReportChase =
  | { kind: "start"; leaderScore: number | null }
  | { kind: "leader"; leadOverNext: number | null }
  | { kind: "climb"; aboveName: string; aboveRank: number; gap: number; inTop10: boolean; top10Cutoff: number | null; gapToTop10: number | null; quizzesMissed: number }
  | { kind: "recorded" };

export type StudentReport = {
  personId: string;
  email: string;
  name: string;
  firstName: string;
  pzId: string;
  mode: "live" | "recorded";
  hasData: boolean;
  rank: number | null;
  /** Number of ranked (live, with results) students. */
  rankedCount: number;
  score: number;
  correct: number;
  incorrect: number;
  /** Correct answers as a share of all answers, 0 to 100; null when there are no answers. */
  accuracy: number | null;
  attendance: { attended: number; held: number; pct: number | null; meetsMin: boolean | null } | null;
  classes: ReportClass[];
  top: ReportTopRow[];
  /** Set when the student is ranked but below the top 10. */
  meBelow: { rank: number; score: number; positionsBelow: number } | null;
  chase: ReportChase;
};

export type BatchReport = {
  title: string;
  slug: string;
  minPct: number;
  quizClasses: number;
  rankedCount: number;
  students: StudentReport[];
};

const TOP = 10;

function firstNameOf(name: string, pzId: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || pzId.split("-")[0] || "there";
}

export function buildBatchReport(input: ReportInput): BatchReport {
  const view = buildPortalBatch({
    ...input,
    scores: input.quiz.map((q) => ({ sessionId: q.sessionId, personId: q.personId, score: q.score })),
  });

  const personByPzId = new Map(input.people.map((p) => [p.pzId, p]));
  const quizSessions = view.sessions.filter((s) => (view.perClass[s.id] ?? []).length > 0);
  const ranked = view.overall.filter((r): r is PortalResultRow & { rank: number } => r.rank !== null);
  const rankedCount = ranked.length;

  // Correct and incorrect per person per class (one quiz row per person per class).
  const detail = new Map<string, ReportQuizRow>();
  for (const q of input.quiz) detail.set(`${q.personId}:${q.sessionId}`, q);

  const overallByPzId = new Map(view.overall.map((r) => [r.pzId, r]));
  const topRows = ranked.slice(0, TOP);
  const cutoff = topRows.length >= TOP ? topRows[TOP - 1].score : null;

  const students: StudentReport[] = [];
  for (const a of view.attendance) {
    const person = personByPzId.get(a.pzId);
    if (!person) continue;
    const email = (input.emails[person.id] ?? "").trim();
    const me = overallByPzId.get(a.pzId);
    const classes: ReportClass[] = quizSessions.map((s) => {
      const row = (view.perClass[s.id] ?? []).find((r) => r.pzId === a.pzId);
      const d = detail.get(`${person.id}:${s.id}`);
      return {
        number: s.number,
        title: s.title,
        attempted: !!row,
        rank: row?.rank ?? null,
        score: row?.score ?? 0,
        correct: d?.correct ?? 0,
        incorrect: d?.incorrect ?? 0,
      };
    });
    const correct = classes.reduce((n, c) => n + c.correct, 0);
    const incorrect = classes.reduce((n, c) => n + c.incorrect, 0);
    const answers = correct + incorrect;
    const hasData = classes.some((c) => c.attempted);
    const rank = me?.rank ?? null;
    const score = me?.score ?? 0;

    let chase: ReportChase;
    if (a.mode === "recorded") chase = { kind: "recorded" };
    else if (!hasData || rank === null) chase = { kind: "start", leaderScore: ranked[0]?.score ?? null };
    else if (rank === 1) {
      const next = ranked.find((r) => r.score < score);
      chase = { kind: "leader", leadOverNext: next ? score - next.score : null };
    } else {
      // The nearest student with a higher score.
      const above = [...ranked].reverse().find((r) => r.score > score)!;
      chase = {
        kind: "climb",
        aboveName: above.name,
        aboveRank: above.rank,
        gap: above.score - score,
        inTop10: rank <= TOP,
        top10Cutoff: cutoff,
        gapToTop10: cutoff !== null && rank > TOP ? Math.max(0, cutoff - score) : null,
        quizzesMissed: classes.filter((c) => !c.attempted).length,
      };
    }

    const myPos = ranked.findIndex((r) => r.pzId === a.pzId);
    students.push({
      personId: person.id,
      email,
      name: a.name,
      firstName: firstNameOf(publicName(person.pzId, person.displayName), person.pzId),
      pzId: a.pzId,
      mode: a.mode,
      hasData,
      rank,
      rankedCount,
      score,
      correct,
      incorrect,
      accuracy: answers > 0 ? Math.round((correct / answers) * 100) : null,
      attendance: a.mode === "live" && a.held !== null && a.attended !== null ? { attended: a.attended, held: a.held, pct: a.pct, meetsMin: a.meetsMin } : null,
      classes,
      top: topRows.map((r) => ({ rank: r.rank, name: r.name, score: r.score, isMe: r.pzId === a.pzId })),
      meBelow: rank !== null && myPos >= TOP ? { rank, score, positionsBelow: myPos + 1 - TOP } : null,
      chase,
    });
  }

  return { title: input.title, slug: input.slug, minPct: input.minPct, quizClasses: quizSessions.length, rankedCount, students };
}
