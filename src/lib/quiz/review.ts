// src/lib/quiz/review.ts
// Pure review model for an uploaded Kahoot report. The server builds a serializable
// ReviewBase once (matches, people, suggestions); the screen keeps only the admin's
// Choices and calls computeReview() on every click. Nothing is ever decided silently:
// duplicates, unknown players and people not in this batch stay "undecided" until the
// admin picks (a suggestion is only highlighted, never applied).
import { normalizePzId } from "@/lib/pzid/format";
import type { KahootRow } from "./kahoot-parse";
import { matchPlayer, type AliasMap, type Match } from "./match";

export type PersonInfo = { personId: string; pzId: string; name: string; mode: "live" | "recorded" | null };

export type PriorDecision = {
  kind: "duplicate" | "alias" | "skip";
  key: string;
  choice: string;
  personId: string | null;
};

export type Choices = {
  /** by row line */
  unknown: Record<string, { personId: string } | "skip">;
  /** by person id */
  duplicate: Record<string, "merge" | { keep: number }>;
  /** by person id */
  notInBatch: Record<string, "include" | "skip">;
};

export type ReviewBase = {
  rows: { row: KahootRow; match: Match }[];
  people: Record<string, PersonInfo>;
  /** suggested person ids by row line, best first */
  suggestions: Record<string, string[]>;
  /** Remembered from an earlier save of this session. */
  prior: Choices;
  /** Answers the app is sure about. Applied on upload (see initialChoices); the admin can still change each one. */
  auto: Choices;
  /** Best guesses the app is fairly sure about. Never applied alone: the admin accepts them all with one click (see acceptLikely). */
  likely: Choices;
  questionCount: number | null;
};

export type ReviewItem =
  | { type: "duplicate"; id: string; person: PersonInfo; rows: KahootRow[]; choice: "merge" | { keep: number } | null; suggested: { keep: number } | null }
  | { type: "unknown"; id: string; row: KahootRow; suggestions: PersonInfo[]; choice: { personId: string } | "skip" | null }
  | { type: "not_in_batch"; id: string; person: PersonInfo; rows: KahootRow[]; choice: "include" | "skip" | null };

export type CleanRow = { row: KahootRow; person: PersonInfo; rejoin: boolean };

export type Review = {
  items: ReviewItem[];
  clean: CleanRow[];
  undecided: number;
  maxScoreDefault: number;
};

export type FinalRow = { personId: string; score: number; correct: number; incorrect: number; player: string };
export type Summary = { saved: number; merged: number; dropped: number; skipped: number };
export type Resolved = { ok: true; rows: FinalRow[]; summary: Summary } | { ok: false; undecided: number };

export const EMPTY_CHOICES: Choices = { unknown: {}, duplicate: {}, notInBatch: {} };
const POINTS_PER_QUESTION = 1000;
const MAX_SUGGESTIONS = 5;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const unknownPerson = (personId: string): PersonInfo => ({ personId, pzId: "", name: "Unknown person", mode: null });

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 2);
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// How sure the app must be. "Sure" needs a near-exact ID and a clear gap to the runner-up; "fairly sure" a good match with a gap.
const SURE_MIN = 90;
const SURE_GAP = 40;
const FAIRLY_MIN = 40;
const FAIRLY_GAP = 20;

type Scored = { id: string; score: number };

function tierOf(scored: Scored[]): "sure" | "fairly" | null {
  const top = scored[0];
  if (!top) return null;
  const gap = top.score - (scored[1]?.score ?? 0);
  if (top.score >= SURE_MIN && gap >= SURE_GAP) return "sure";
  if (top.score >= FAIRLY_MIN && gap >= FAIRLY_GAP) return "fairly";
  return null;
}

function suggest(row: KahootRow, batch: PersonInfo[], keysByPerson: Map<string, string[]>): string[] {
  return scoreCandidates(row, batch, keysByPerson).map((s) => s.id);
}

function scoreCandidates(row: KahootRow, batch: PersonInfo[], keysByPerson: Map<string, string[]>): Scored[] {
  const player = squash(row.player);
  const want = new Set([...tokens(row.player), ...tokens(row.hint)]);
  const scored: { id: string; score: number }[] = [];
  for (const p of batch) {
    const keys = [squash(p.pzId), ...(keysByPerson.get(p.personId) ?? [])].filter(Boolean);
    let score = 0;
    if (player !== "") {
      if (keys.some((k) => k === player)) score = Math.max(score, 100);
      else if (player.length >= 3 && keys.some((k) => k.startsWith(player) || player.startsWith(k))) score = Math.max(score, 60);
      const d = Math.min(...keys.map((k) => editDistance(k, player)));
      if (d <= 2) score = Math.max(score, 40 - d * 10);
    }
    const nameTokens = tokens(p.name);
    const overlap = nameTokens.filter((t) => want.has(t)).length;
    if (overlap > 0) score += 10 * overlap + (overlap === nameTokens.length && nameTokens.length > 1 ? 30 : 0);
    if (score > 0) scored.push({ id: p.personId, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, MAX_SUGGESTIONS);
}

const sig = (r: KahootRow) => `${normalizePzId(r.player)}|${r.score}`;

/** Which person each row currently belongs to, from matches and the unknown-row choices. */
function assign(base: ReviewBase, choices: Choices): { byPerson: Map<string, { row: KahootRow; rejoin: boolean }[]>; skipped: KahootRow[]; unknownRows: KahootRow[] } {
  const byPerson = new Map<string, { row: KahootRow; rejoin: boolean }[]>();
  const skipped: KahootRow[] = [];
  const unknownRows: KahootRow[] = [];
  const add = (personId: string, row: KahootRow, rejoin: boolean) => {
    const list = byPerson.get(personId) ?? [];
    list.push({ row, rejoin });
    byPerson.set(personId, list);
  };
  for (const { row, match } of base.rows) {
    if (match.kind !== "unknown") { add(match.personId, row, match.kind === "rejoin"); continue; }
    const c = choices.unknown[String(row.line)];
    if (c === "skip") skipped.push(row);
    else if (c) add(c.personId, row, false);
    else unknownRows.push(row);
  }
  return { byPerson, skipped, unknownRows };
}

const personOf = (base: ReviewBase, id: string): PersonInfo => base.people[id] ?? unknownPerson(id);

export function buildBase(
  rows: KahootRow[],
  aliases: AliasMap,
  people: Map<string, PersonInfo>,
  decisions: PriorDecision[],
  questionCount: number | null = null,
): ReviewBase {
  const keysByPerson = new Map<string, string[]>();
  aliases.forEach((personId, alias) => {
    const list = keysByPerson.get(personId) ?? [];
    list.push(squash(alias));
    keysByPerson.set(personId, list);
  });
  const batch = Array.from(people.values()).filter((p) => p.mode !== null);

  const matched = rows.map((row) => ({ row, match: matchPlayer(row.player, aliases) }));
  const suggestions: Record<string, string[]> = {};
  const scoredByLine = new Map<number, Scored[]>();
  for (const { row, match } of matched) {
    if (match.kind !== "unknown") continue;
    const scored = scoreCandidates(row, batch, keysByPerson);
    scoredByLine.set(row.line, scored);
    suggestions[String(row.line)] = scored.map((s) => s.id);
  }

  const base: ReviewBase = {
    rows: matched,
    people: Object.fromEntries(Array.from(people.entries())),
    suggestions,
    prior: { unknown: {}, duplicate: {}, notInBatch: {} },
    auto: { unknown: {}, duplicate: {}, notInBatch: {} },
    likely: { unknown: {}, duplicate: {}, notInBatch: {} },
    questionCount,
  };

  // remembered choices from an earlier save of this session
  for (const { row, match } of matched) {
    if (match.kind !== "unknown") continue;
    const key = normalizePzId(row.player);
    const alias = decisions.find((d) => d.kind === "alias" && d.key === key && d.personId && people.has(d.personId));
    if (alias?.personId) base.prior.unknown[String(row.line)] = { personId: alias.personId };
    else if (decisions.some((d) => d.kind === "skip" && d.key === key)) base.prior.unknown[String(row.line)] = "skip";
  }
  const { byPerson } = assign(base, base.prior);
  byPerson.forEach((list, personId) => {
    if (list.length < 2) return;
    const d = decisions.find((x) => x.kind === "duplicate" && x.key === personId);
    if (!d) return;
    if (d.choice === "merge") base.prior.duplicate[personId] = "merge";
    else if (d.choice.startsWith("keep:")) {
      const hit = list.find((x) => sig(x.row) === d.choice.slice(5));
      if (hit) base.prior.duplicate[personId] = { keep: hit.row.line };
    }
  });

  // Automatic answers. What the admin chose last time always wins; the app fills in only what is left.
  for (const { row, match } of matched) {
    const line = String(row.line);
    if (match.kind !== "unknown" || base.prior.unknown[line]) continue;
    const scored = scoredByLine.get(row.line) ?? [];
    const tier = tierOf(scored);
    if (tier === "sure") base.auto.unknown[line] = { personId: scored[0].id };
    else if (tier === "fairly") base.likely.unknown[line] = { personId: scored[0].id };
    else if (row.score === 0) base.auto.unknown[line] = "skip"; // nobody to match and no points: nothing to count
  }
  const sure: Choices = {
    unknown: { ...base.prior.unknown, ...base.auto.unknown },
    duplicate: { ...base.prior.duplicate },
    notInBatch: { ...base.prior.notInBatch },
  };
  const first = deriveOthers(base, sure);
  Object.assign(base.auto.duplicate, first.keep);
  Object.assign(base.auto.notInBatch, first.skipOutsiders);
  Object.assign(base.likely.duplicate, first.merge);
  if (Object.keys(base.likely.unknown).length > 0) {
    // People who only become duplicates or outsiders once the best guesses are accepted.
    const guessed: Choices = {
      unknown: { ...sure.unknown, ...base.likely.unknown },
      duplicate: { ...sure.duplicate, ...base.auto.duplicate, ...base.likely.duplicate },
      notInBatch: { ...sure.notInBatch, ...base.auto.notInBatch },
    };
    const second = deriveOthers(base, guessed);
    Object.assign(base.likely.duplicate, second.keep, second.merge);
    Object.assign(base.likely.notInBatch, second.skipOutsiders);
  }
  return base;
}

/**
 * For people not yet answered under `choices`: a student who played twice keeps the one scored row (or the
 * first if none scored; "keep"), or has both added together when both scored ("merge", only a good guess);
 * a student outside this batch is skipped ("skipOutsiders").
 */
function deriveOthers(base: ReviewBase, choices: Choices): { keep: Record<string, { keep: number }>; merge: Record<string, "merge">; skipOutsiders: Record<string, "skip"> } {
  const out = { keep: {} as Record<string, { keep: number }>, merge: {} as Record<string, "merge">, skipOutsiders: {} as Record<string, "skip"> };
  const { byPerson } = assign(base, choices);
  byPerson.forEach((list, personId) => {
    if (personOf(base, personId).mode === null && !choices.notInBatch[personId]) out.skipOutsiders[personId] = "skip";
    if (list.length < 2 || choices.duplicate[personId]) return;
    const rows = list.map((x) => x.row).sort((a, b) => a.line - b.line);
    const scored = rows.filter((r) => r.score > 0);
    if (scored.length <= 1) out.keep[personId] = { keep: (scored[0] ?? rows[0]).line };
    else out.merge[personId] = "merge";
  });
  return out;
}

const overlay = (a: Choices, b: Choices): Choices => ({
  unknown: { ...a.unknown, ...b.unknown },
  duplicate: { ...a.duplicate, ...b.duplicate },
  notInBatch: { ...a.notInBatch, ...b.notInBatch },
});

/** What the screen starts with after an upload: last time's answers, then the app's sure answers for everything else. */
export function initialChoices(base: ReviewBase): Choices {
  return overlay(base.auto, base.prior);
}

/** Accept every best guess for the items still waiting; answers already given are never changed. */
export function acceptLikely(base: ReviewBase, choices: Choices): Choices {
  const pick = <T,>(guess: Record<string, T>, have: Record<string, unknown>): Record<string, T> =>
    Object.fromEntries(Object.entries(guess).filter(([k]) => have[k] === undefined));
  return overlay(choices, {
    unknown: pick(base.likely.unknown, choices.unknown),
    duplicate: pick(base.likely.duplicate, choices.duplicate),
    notInBatch: pick(base.likely.notInBatch, choices.notInBatch),
  });
}

export function computeReview(base: ReviewBase, choices: Choices): Review {
  const { byPerson, unknownRows } = assign(base, choices);
  const items: ReviewItem[] = [];
  const clean: CleanRow[] = [];

  for (const row of unknownRows) {
    items.push({
      type: "unknown",
      id: `unknown:${row.line}`,
      row,
      suggestions: (base.suggestions[String(row.line)] ?? []).map((id) => personOf(base, id)),
      choice: null,
    });
  }
  // Rows the admin has already sent somewhere stay visible (so the choice can be changed).
  for (const { row, match } of base.rows) {
    const c = choices.unknown[String(row.line)];
    if (match.kind === "unknown" && c) {
      items.push({ type: "unknown", id: `unknown:${row.line}`, row, suggestions: (base.suggestions[String(row.line)] ?? []).map((id) => personOf(base, id)), choice: c });
    }
  }

  byPerson.forEach((list, personId) => {
    const person = personOf(base, personId);
    const rows = list.map((x) => x.row).sort((a, b) => a.line - b.line);
    if (person.mode === null) {
      items.push({ type: "not_in_batch", id: `batch:${personId}`, person, rows, choice: choices.notInBatch[personId] ?? null });
    }
    if (list.length > 1) {
      const raw = choices.duplicate[personId];
      const choice = raw === "merge" || (raw && rows.some((r) => r.line === raw.keep)) ? raw : null;
      const scored = rows.filter((r) => r.score > 0);
      const suggested = scored.length === 1 && rows.length > 1 ? { keep: scored[0].line } : null;
      items.push({ type: "duplicate", id: `dup:${personId}`, person, rows, choice: choice ?? null, suggested });
    } else if (person.mode !== null || choices.notInBatch[personId] === "include") {
      clean.push({ row: list[0].row, person, rejoin: list[0].rejoin });
    }
  });

  items.sort((a, b) => firstLine(a) - firstLine(b));
  clean.sort((a, b) => a.row.line - b.row.line);

  const undecided = items.filter((i) => i.choice === null).length;
  const highest = Math.max(0, ...base.rows.map((r) => r.row.score), ...mergedTotals(base, choices));
  const byQuestions = base.questionCount ? base.questionCount * POINTS_PER_QUESTION : 0;
  return { items, clean, undecided, maxScoreDefault: Math.max(highest, byQuestions) };
}

function firstLine(i: ReviewItem): number {
  return i.type === "unknown" ? i.row.line : i.rows[0].line;
}

function mergedTotals(base: ReviewBase, choices: Choices): number[] {
  const { byPerson } = assign(base, choices);
  const out: number[] = [];
  byPerson.forEach((list, personId) => {
    if (list.length > 1 && choices.duplicate[personId] === "merge") out.push(list.reduce((s, x) => s + x.row.score, 0));
  });
  return out;
}

export function resolveReview(base: ReviewBase, choices: Choices): Resolved {
  const review = computeReview(base, choices);
  if (review.undecided > 0) return { ok: false, undecided: review.undecided };

  const { byPerson, skipped } = assign(base, choices);
  const rows: FinalRow[] = [];
  const summary: Summary = { saved: 0, merged: 0, dropped: 0, skipped: skipped.length };

  byPerson.forEach((list, personId) => {
    const group = list.map((x) => x.row).sort((a, b) => a.line - b.line);
    if (choices.notInBatch[personId] === "skip" && personOf(base, personId).mode === null) {
      summary.skipped += group.length;
      return;
    }
    if (group.length === 1) {
      rows.push(finalOf(personId, group[0]));
      summary.saved++;
      return;
    }
    const choice = choices.duplicate[personId];
    if (choice === "merge") {
      const top = group.reduce((a, b) => (b.score > a.score ? b : a));
      rows.push({
        personId,
        score: group.reduce((s, r) => s + r.score, 0),
        correct: group.reduce((s, r) => s + r.correct, 0),
        incorrect: group.reduce((s, r) => s + r.incorrect, 0),
        player: top.player.trim(),
      });
      summary.saved++;
      summary.merged += group.length - 1;
    } else if (choice) {
      const kept = group.find((r) => r.line === choice.keep) as KahootRow;
      rows.push(finalOf(personId, kept));
      summary.saved++;
      summary.dropped += group.length - 1;
    }
  });
  return { ok: true, rows, summary };
}

function finalOf(personId: string, r: KahootRow): FinalRow {
  return { personId, score: r.score, correct: r.correct, incorrect: r.incorrect, player: r.player.trim() };
}

/** "Skip all unknown players with 0 points": touches only undecided unknown rows. */
export function bulkSkipZero(base: ReviewBase, choices: Choices): Choices {
  const next: Choices = { ...choices, unknown: { ...choices.unknown } };
  for (const { row, match } of base.rows) {
    if (match.kind === "unknown" && row.score === 0 && !next.unknown[String(row.line)]) next.unknown[String(row.line)] = "skip";
  }
  return next;
}

/** What to remember for the next upload of this session. */
export function decisionsFromChoices(base: ReviewBase, choices: Choices): PriorDecision[] {
  const out: PriorDecision[] = [];
  for (const { row, match } of base.rows) {
    if (match.kind !== "unknown") continue;
    const c = choices.unknown[String(row.line)];
    const key = normalizePzId(row.player);
    if (!c || key === "") continue;
    out.push(c === "skip" ? { kind: "skip", key, choice: "", personId: null } : { kind: "alias", key, choice: "", personId: c.personId });
  }
  const { byPerson } = assign(base, choices);
  byPerson.forEach((list, personId) => {
    const c = choices.duplicate[personId];
    if (list.length < 2 || !c) return;
    if (c === "merge") out.push({ kind: "duplicate", key: personId, choice: "merge", personId });
    else {
      const kept = list.find((x) => x.row.line === c.keep);
      if (kept) out.push({ kind: "duplicate", key: personId, choice: `keep:${sig(kept.row)}`, personId });
    }
  });
  // one decision per (kind, key): the last one wins
  const seen = new Map<string, PriorDecision>();
  for (const d of out) seen.set(`${d.kind}:${d.key}`, d);
  return Array.from(seen.values());
}
