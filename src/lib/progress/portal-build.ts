// Pure builder for the public batch portal (attendance + results lists).
// Public rows carry first name + PZ ID only. No server imports, no clock: `now` is an input.
import { matchAudience, parseOption, type Audience } from "@/lib/classes/audience";
import { attendancePercent, meetsMinimum } from "@/lib/attendance/rules";
import type { ProgressKind } from "@/lib/progress/build";

export type PortalSessionInput = {
  id: string;
  number: number;
  title: string;
  startsAt: string;
  /** null = no audience stored = counts for everyone. */
  audience: Audience | null;
  quizMax: number | null;
};
export type PortalRegInput = { personId: string; mode: "live" | "recorded"; optionLabel: string };
export type PortalPersonInput = { id: string; pzId: string; displayName: string };
export type PortalBatchInput = {
  pageId: string;
  title: string;
  slug: string;
  kind: ProgressKind;
  minPct: number;
  sessions: PortalSessionInput[];
  people: PortalPersonInput[];
  regs: PortalRegInput[];
  marks: { sessionId: string; personId: string; how?: "check-in" | "admin" }[];
  scores: { sessionId: string; personId: string; score: number }[];
  /** The batch's landing page is closed (status 'closed'). */
  closed?: boolean;
  /** Safe http(s) cover picture, already chosen by the loader. */
  coverUrl?: string | null;
  now: Date;
};

export type PortalAttendanceRow = {
  firstName: string;
  pzId: string;
  mode: "live" | "recorded";
  attended: number | null;
  held: number | null;
  pct: number | null;
  meetsMin: boolean | null;
  classes: { number: number; title: string; startsAt: string; state: "present" | "absent" | "upcoming"; how: "check-in" | "admin" | null }[];
};
export type PortalResultRow = {
  firstName: string;
  pzId: string;
  mode: "live" | "recorded";
  score: number;
  rank: number | null;
};
export type PortalBatchView = {
  title: string;
  slug: string;
  kind: ProgressKind;
  minPct: number;
  state: "live" | "completed" | "recorded";
  coverUrl: string | null;
  students: number;
  classesHeld: number;
  sessions: { id: string; number: number; title: string; quizMax: number | null }[];
  attendance: PortalAttendanceRow[];
  overall: PortalResultRow[];
  perClass: Record<string, PortalResultRow[]>;
};
export type PortalBatchCard = {
  title: string;
  slug: string;
  kind: ProgressKind;
  students: number;
  classesHeld: number;
  classesTotal: number;
  lastClassAt: string | null;
  state: "live" | "completed" | "recorded";
  coverUrl: string | null;
};

const time = (iso: string) => new Date(iso).getTime();
const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const cmpText = (a: string, b: string) => a.localeCompare(b);

type Student = { person: PortalPersonInput; firstName: string; mode: "live" | "recorded"; labels: string[] };

function students(input: PortalBatchInput): Student[] {
  const byId = new Map(input.people.map((p) => [p.id, p]));
  const regsBy = new Map<string, PortalRegInput[]>();
  for (const r of input.regs) {
    if (!byId.has(r.personId)) continue;
    const list = regsBy.get(r.personId) ?? [];
    list.push(r);
    regsBy.set(r.personId, list);
  }
  const out: Student[] = [];
  for (const [id, regs] of Array.from(regsBy.entries())) {
    const person = byId.get(id)!;
    const live = regs.filter((r) => r.mode === "live");
    out.push({
      person,
      firstName: firstNameOf(person.displayName),
      mode: live.length > 0 ? "live" : "recorded",
      labels: live.map((r) => r.optionLabel),
    });
  }
  return out;
}

const byName = (a: { firstName: string; pzId: string }, b: { firstName: string; pzId: string }) =>
  cmpText(a.firstName, b.firstName) || cmpText(a.pzId, b.pzId);

/** Competition ranking among live rows (10, 10, 5 -> 1, 1, 3); recorded rows listed after, unranked. */
function rankRows(rows: { s: Student; score: number }[]): PortalResultRow[] {
  const liveScores = rows.filter((r) => r.s.mode === "live").map((r) => r.score);
  const make = (r: { s: Student; score: number }): PortalResultRow => ({
    firstName: r.s.firstName,
    pzId: r.s.person.pzId,
    mode: r.s.mode,
    score: r.score,
    rank: r.s.mode === "live" ? 1 + liveScores.filter((x) => x > r.score).length : null,
  });
  const sorter = (a: PortalResultRow, b: PortalResultRow) => b.score - a.score || byName(a, b);
  return [
    ...rows.filter((r) => r.s.mode === "live").map(make).sort(sorter),
    ...rows.filter((r) => r.s.mode === "recorded").map(make).sort(sorter),
  ];
}

function batchState(b: PortalBatchInput): PortalBatchCard["state"] {
  const people = new Set(b.people.map((p) => p.id));
  const regsOf = b.regs.filter((r) => people.has(r.personId));
  const students = new Set(regsOf.map((r) => r.personId)).size;
  const held = b.sessions.filter((s) => time(s.startsAt) <= b.now.getTime()).length;
  const allRecorded = students > 0 && regsOf.every((r) => r.mode === "recorded");
  if (b.closed === true || (b.sessions.length > 0 && held === b.sessions.length)) return "completed";
  return allRecorded ? "recorded" : "live";
}

export function buildPortalBatch(input: PortalBatchInput): PortalBatchView {
  const sessions = [...input.sessions].sort((a, b) => a.number - b.number);
  const all = students(input);
  const nowMs = input.now.getTime();

  const attendance: PortalAttendanceRow[] = all
    .map((s): PortalAttendanceRow => {
      const base = { firstName: s.firstName, pzId: s.person.pzId, mode: s.mode };
      if (s.mode === "recorded") {
        return { ...base, attended: null, held: null, pct: null, meetsMin: null, classes: [] };
      }
      const scopes = s.labels.map(parseOption);
      const marked = new Map(input.marks.filter((m) => m.personId === s.person.id).map((m) => [m.sessionId, m.how ?? "check-in"] as const));
      const classes = sessions
        .filter((x) => x.audience === null || scopes.some((sc) => matchAudience(sc, x.audience!).include))
        .map((x) => ({
          number: x.number,
          title: x.title,
          startsAt: x.startsAt,
          state: (time(x.startsAt) > nowMs ? "upcoming" : marked.has(x.id) ? "present" : "absent") as
            | "present"
            | "absent"
            | "upcoming",
          how: time(x.startsAt) > nowMs ? null : (marked.get(x.id) ?? null),
        }));
      const held = classes.filter((c) => c.state !== "upcoming").length;
      const attended = classes.filter((c) => c.state === "present").length;
      const pct = attendancePercent(attended, held);
      return { ...base, attended, held, pct, meetsMin: meetsMinimum(pct, input.minPct), classes };
    })
    .sort(byName);

  const studentById = new Map(all.map((s) => [s.person.id, s]));
  const sessionIds = new Set(sessions.map((s) => s.id));
  const totals = new Map<string, number>();
  const perSession = new Map<string, { s: Student; score: number }[]>();
  for (const sc of input.scores) {
    const s = studentById.get(sc.personId);
    if (!s || !sessionIds.has(sc.sessionId)) continue;
    totals.set(sc.personId, (totals.get(sc.personId) ?? 0) + sc.score);
    const list = perSession.get(sc.sessionId) ?? [];
    list.push({ s, score: sc.score });
    perSession.set(sc.sessionId, list);
  }

  const overall = rankRows(Array.from(totals, ([id, score]) => ({ s: studentById.get(id)!, score })));
  const perClass: Record<string, PortalResultRow[]> = {};
  for (const x of sessions) perClass[x.id] = rankRows(perSession.get(x.id) ?? []);

  return {
    title: input.title,
    slug: input.slug,
    kind: input.kind,
    minPct: input.minPct,
    state: batchState(input),
    coverUrl: input.coverUrl ?? null,
    students: all.length,
    classesHeld: sessions.filter((x) => time(x.startsAt) <= nowMs).length,
    sessions: sessions.map((x) => ({ id: x.id, number: x.number, title: x.title, quizMax: x.quizMax })),
    attendance,
    overall,
    perClass,
  };
}

export function buildPortalCards(batches: PortalBatchInput[]): PortalBatchCard[] {
  const cards = batches.map((b) => {
    const last = b.sessions.reduce((max, s) => Math.max(max, time(s.startsAt)), Number.NEGATIVE_INFINITY);
    const people = new Set(b.people.map((p) => p.id));
    const students = new Set(b.regs.filter((r) => people.has(r.personId)).map((r) => r.personId)).size;
    const regsOf = b.regs.filter((r) => people.has(r.personId));
    const classesHeld = b.sessions.filter((s) => time(s.startsAt) <= b.now.getTime()).length;
    const state = batchState(b);
    const card: PortalBatchCard = {
      title: b.title,
      slug: b.slug,
      kind: b.kind,
      students,
      classesHeld,
      classesTotal: b.sessions.length,
      lastClassAt: b.sessions.find((s) => time(s.startsAt) === last)?.startsAt ?? null,
      state,
      coverUrl: b.coverUrl ?? null,
    };
    return { card, last };
  });
  return cards
    .sort((a, b) => b.last - a.last || cmpText(a.card.title, b.card.title) || cmpText(a.card.slug, b.card.slug))
    .map((c) => c.card);
}
