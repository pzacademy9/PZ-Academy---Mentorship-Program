// Pure builder for the public "Track Your Progress" page. No server imports, no clock:
// `now` is passed in. The input holds ONE person's data (plus anonymous live scores for ranking).
import { matchAudience, parseOption, type Audience } from "@/lib/classes/audience";
import { attendancePercent, meetsMinimum } from "@/lib/attendance/rules";

export type ProgressKind = "course" | "workshop" | "webinar";
export type MarkSource = "personal" | "shared" | "admin";

export type SessionInput = {
  id: string;
  number: number;
  title: string;
  startsAt: string;
  /** null = no audience stored = counts for everyone. */
  audience: Audience | null;
  quizMax: number | null;
};

export type BatchInput = {
  pageId: string;
  title: string;
  slug: string;
  kind: ProgressKind;
  minPct: number;
  mode: "live" | "recorded";
  /** Option labels of ALL this person's live registrations in the batch (a class counts if any matches). */
  optionLabels: string[];
  sessions: SessionInput[];
  /** This person's attendance marks: session id -> how it was marked. */
  marks: Record<string, MarkSource>;
  /** This person's saved quiz scores: session id -> score. */
  myScores: Record<string, number>;
  /** Saved scores of every LIVE student per session (anonymous numbers), used for the rank. */
  liveScores: Record<string, number[]>;
};

export type ProgressInput = {
  person: { displayName: string; pzId: string };
  batches: BatchInput[];
  now: Date;
};

export type AttendanceRow = {
  number: number;
  title: string;
  startsAt: string;
  state: "present" | "absent" | "upcoming";
  how: "check-in" | "admin" | null;
};
export type ResultRow = {
  number: number;
  title: string;
  startsAt: string;
  score: number;
  max: number | null;
  rank: number | null;
  of: number | null;
};
export type ProgressBatch = {
  title: string;
  slug: string;
  latest: boolean;
  mode: "live" | "recorded";
  attendance: {
    attended: number;
    held: number;
    pct: number | null;
    meetsMin: boolean;
    minPct: number;
    rows: AttendanceRow[];
  } | null;
  results: { total: number; rows: ResultRow[] };
};
export type ProgressGroup = { kind: ProgressKind; batches: ProgressBatch[] };
export type Progress = { firstName: string; pzId: string; groups: ProgressGroup[] };

const KIND_ORDER: ProgressKind[] = ["course", "workshop", "webinar"];

const time = (iso: string) => new Date(iso).getTime();

function buildBatch(b: BatchInput, now: Date): ProgressBatch {
  const sessions = [...b.sessions].sort((a, c) => a.number - c.number);

  let attendance: ProgressBatch["attendance"] = null;
  if (b.mode === "live") {
    const scopes = b.optionLabels.map(parseOption);
    const mine = sessions.filter((s) => s.audience === null || scopes.some((scope) => matchAudience(scope, s.audience!).include));
    const rows: AttendanceRow[] = mine.map((s) => {
      const source = b.marks[s.id];
      const started = time(s.startsAt) <= now.getTime();
      if (!started) return { number: s.number, title: s.title, startsAt: s.startsAt, state: "upcoming", how: null };
      if (!source) return { number: s.number, title: s.title, startsAt: s.startsAt, state: "absent", how: null };
      return { number: s.number, title: s.title, startsAt: s.startsAt, state: "present", how: source === "admin" ? "admin" : "check-in" };
    });
    const held = rows.filter((r) => r.state !== "upcoming").length;
    const attended = rows.filter((r) => r.state === "present").length;
    const pct = attendancePercent(attended, held);
    attendance = { attended, held, pct, meetsMin: meetsMinimum(pct, b.minPct), minPct: b.minPct, rows };
  }

  const resultRows: ResultRow[] = sessions
    .filter((s) => typeof b.myScores[s.id] === "number")
    .map((s) => {
      const score = b.myScores[s.id];
      const live = b.liveScores[s.id] ?? [];
      const ranked = b.mode === "live";
      return {
        number: s.number,
        title: s.title,
        startsAt: s.startsAt,
        score,
        max: s.quizMax,
        // Competition ranking: 10, 10, 5 gives ranks 1, 1, 3.
        rank: ranked ? 1 + live.filter((x) => x > score).length : null,
        of: ranked ? live.length : null,
      };
    });

  return {
    title: b.title,
    slug: b.slug,
    latest: false,
    mode: b.mode,
    attendance,
    results: { total: resultRows.reduce((sum, r) => sum + r.score, 0), rows: resultRows },
  };
}

export function buildProgress(input: ProgressInput): Progress {
  const lastClass = (b: BatchInput): number =>
    b.sessions.reduce((max, s) => Math.max(max, time(s.startsAt)), Number.NEGATIVE_INFINITY);

  const ordered = [...input.batches].sort(
    (a, b) => lastClass(b) - lastClass(a) || a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug),
  );
  const newest = ordered.find((b) => b.sessions.length > 0);

  const groups: ProgressGroup[] = [];
  for (const kind of KIND_ORDER) {
    const batches = ordered
      .filter((b) => b.kind === kind)
      .map((b) => ({ ...buildBatch(b, input.now), latest: b === newest }));
    if (batches.length > 0) groups.push({ kind, batches });
  }

  return {
    firstName: input.person.displayName.trim().split(/\s+/)[0] ?? "",
    pzId: input.person.pzId,
    groups,
  };
}
