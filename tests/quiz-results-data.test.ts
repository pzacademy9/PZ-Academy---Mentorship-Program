// tests/quiz-results-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import {
  getBatchLeaderboard, getSessionQuiz, listQuizWithoutCheckin, markPresentFromQuiz, prepareReview, saveQuizResults,
} from "@/lib/data/quiz-results";

const reg = (id: string, personId: string, over: Record<string, unknown> = {}) => ({
  id, page_id: "pg1", person_id: personId, mode: "live", status: "paid", is_test: false, ...over,
});
const result = (id: string, session: string, person: string, score: number) => ({
  id, session_id: session, person_id: person, score, correct: 0, incorrect: 0,
});

let store: Store;
beforeEach(() => {
  db.reset();
  store = {
    pz_people: [
      { id: "p1", pz_id: "Ayesha-1001", display_name: "Ayesha Khan" },
      { id: "p2", pz_id: "Bilal-1002", display_name: "Bilal Ahmed" },
      { id: "p3", pz_id: "Rana-1003", display_name: "Rana Bibi" },
      { id: "p4", pz_id: "Dina-1004", display_name: "Dina Z" },
    ],
    pz_id_aliases: [
      { alias_norm: "ayesha-1001", person_id: "p1" },
      { alias_norm: "bilal-1002", person_id: "p2" },
      { alias_norm: "old-id", person_id: "p4" },
    ],
    landing_registrations: [reg("r1", "p1"), reg("r2", "p2"), reg("r3", "p3", { mode: "recorded" }), reg("r4", "p4", { is_test: true })],
    batch_sessions: [
      { id: "s1", page_id: "pg1", number: 1, quiz_max_score: 100, quiz_saved_at: "2026-11-01T00:00:00Z", quiz_file_name: "a.xlsx" },
      { id: "s2", page_id: "pg1", number: 2, quiz_max_score: 100 },
      { id: "s3", page_id: "pg1", number: 3, quiz_max_score: null },
      { id: "s4", page_id: "pg1", number: 4, quiz_max_score: null },
    ],
    batch_quiz_results: [], batch_quiz_decisions: [], batch_session_marks: [],
  };
  const base = memoryHandler(store, (fn, args, s) => {
    if (fn !== "batch_quiz_save") return { data: null, error: { message: "no rpc" } };
    const a = args as { p_session: string; p_rows: { person_id: string; score: number; correct: number; incorrect: number; player: string }[] };
    s.batch_quiz_results = (s.batch_quiz_results ?? []).filter((r) => r.session_id !== a.p_session);
    for (const r of a.p_rows) s.batch_quiz_results.push({ id: `res-${r.person_id}`, session_id: a.p_session, ...r });
    return { data: a.p_rows.length, error: null };
  });
  // the real table has unique (session_id, person_id); upsert with ignoreDuplicates skips repeats
  db.state.handler = (op) => {
    if (op.table === "batch_session_marks" && op.op === "upsert") {
      const items = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Record<string, unknown>[];
      const fresh = items.filter((p) => !(store.batch_session_marks ?? []).some((m) => m.session_id === p.session_id && m.person_id === p.person_id));
      return base({ ...op, payload: fresh });
    }
    return base(op);
  };
});

const rpcCalls = () => db.state.ops.filter((o) => o.op === "rpc");
const good = (over: Record<string, unknown> = {}) => ({
  maxScore: 100, fileName: "a.xlsx", decisions: [],
  rows: [{ personId: "p1", score: 80, correct: 8, incorrect: 2, player: "Ayesha-1001" }],
  ...over,
}) as Parameters<typeof saveQuizResults>[1];

describe("saveQuizResults validation", () => {
  const bad: [string, Parameters<typeof saveQuizResults>[1]][] = [
    ["negative score", good({ rows: [{ personId: "p1", score: -1, correct: 0, incorrect: 0, player: "" }] })],
    ["fractional score", good({ rows: [{ personId: "p1", score: 1.5, correct: 0, incorrect: 0, player: "" }] })],
    ["repeated person", good({ rows: [{ personId: "p1", score: 1, correct: 0, incorrect: 0, player: "" }, { personId: "p1", score: 2, correct: 0, incorrect: 0, player: "" }] })],
    ["max below top score", good({ maxScore: 50 })],
    ["max zero", good({ maxScore: 0 })],
    ["unknown person", good({ rows: [{ personId: "ghost", score: 1, correct: 0, incorrect: 0, player: "" }] })],
    ["5,001 rows", good({ rows: Array.from({ length: 5001 }, (_, i) => ({ personId: `x${i}`, score: 1, correct: 0, incorrect: 0, player: "" })) })],
  ];
  it.each(bad)("refuses %s and writes nothing", async (_n, input) => {
    const r = await saveQuizResults("s1", input);
    expect(r.ok).toBe(false);
    expect(rpcCalls()).toHaveLength(0);
    expect(store.batch_quiz_results).toHaveLength(0);
  });
  it("refuses a session that does not exist", async () => {
    expect((await saveQuizResults("nope", good())).ok).toBe(false);
    expect(rpcCalls()).toHaveLength(0);
  });
});

describe("saveQuizResults", () => {
  it("calls the save function once, then replaces the remembered decisions", async () => {
    store.batch_quiz_decisions.push({ id: "old", session_id: "s1", kind: "skip", key: "zeb", choice: "", person_id: null });
    const r = await saveQuizResults("s1", good({ decisions: [{ kind: "duplicate", key: "p1", choice: "merge", personId: "p1" }] }));
    expect(r).toMatchObject({ ok: true, saved: 1 });
    expect(rpcCalls()).toHaveLength(1);
    expect(rpcCalls()[0].payload).toMatchObject({ p_session: "s1", p_max: 100, p_file: "a.xlsx" });
    expect(store.batch_quiz_decisions.map((d) => d.key)).toEqual(["p1"]);
  });

  it("re-saving replaces the session's rows (nothing doubles, missing people vanish)", async () => {
    await saveQuizResults("s1", good());
    await saveQuizResults("s1", good({ rows: [{ personId: "p2", score: 10, correct: 1, incorrect: 0, player: "b" }] }));
    expect(store.batch_quiz_results.map((r) => r.person_id)).toEqual(["p2"]);
  });

  it("turns an alias fix into a review alias but never overwrites another student's alias", async () => {
    const r = await saveQuizResults("s1", good({
      decisions: [
        { kind: "alias", key: "sami_x", choice: "", personId: "p1" },
        { kind: "alias", key: "old-id", choice: "", personId: "p1" }, // belongs to p4
      ],
    }));
    expect(r.ok && r.notes).toHaveLength(1);
    expect(store.pz_id_aliases.find((a) => a.alias_norm === "sami_x")).toMatchObject({ person_id: "p1", source: "review" });
    expect(store.pz_id_aliases.find((a) => a.alias_norm === "old-id")?.person_id).toBe("p4");
  });
});

describe("getBatchLeaderboard", () => {
  it("excludes recorded students, shares ranks on ties and computes average and projection", async () => {
    store.pz_people.push({ id: "p5", pz_id: "Eman-1005", display_name: "Eman Q" }, { id: "p6", pz_id: "Fiza-1006", display_name: "Fiza R" });
    store.landing_registrations.push(reg("r5", "p5"), reg("r6", "p6"));
    store.batch_quiz_results.push(
      result("1", "s1", "p1", 80), result("2", "s2", "p1", 60), // total 140, 2 quizzes, avg 70
      result("3", "s1", "p2", 100), result("4", "s2", "p2", 100), // 200
      result("5", "s1", "p5", 100), result("6", "s2", "p5", 100), // 200 tie with p2
      result("7", "s1", "p6", 10), // 10
      result("8", "s1", "p3", 999), // recorded: excluded
      result("9", "s1", "p4", 999), // test registration: not enrolled, excluded
    );
    const { rows, sessionCount } = await getBatchLeaderboard("pg1");
    expect(sessionCount).toBe(4);
    expect(rows.map((r) => [r.name, r.rank, r.total])).toEqual([["Bilal Ahmed", 1, 200], ["Eman Q", 1, 200], ["Ayesha Khan", 3, 140], ["Fiza R", 4, 10]]);
    const ayesha = rows.find((r) => r.personId === "p1");
    expect(ayesha).toMatchObject({ quizzes: 2, avgPct: 70, projectedTotal: 280 });
  });

  it("returns no rows and no projection for a batch with no results", async () => {
    expect(await getBatchLeaderboard("pg1")).toEqual({ rows: [], sessionCount: 4 });
  });
});

describe("no check-in flag", () => {
  beforeEach(() => {
    store.batch_quiz_results.push(result("1", "s1", "p1", 80), result("2", "s1", "p2", 70), result("3", "s1", "p3", 60));
    store.batch_session_marks.push({ id: "m1", session_id: "s1", person_id: "p2" });
  });
  it("lists only live students with a result and no mark", async () => {
    expect((await listQuizWithoutCheckin("s1")).map((p) => p.personId)).toEqual(["p1"]);
  });
  it("marks a live student once, and refuses a recorded-only student without writing", async () => {
    expect(await markPresentFromQuiz("s1", "p1", "adm")).toEqual({ ok: true });
    expect(await markPresentFromQuiz("s1", "p1", "adm")).toEqual({ ok: true });
    expect(store.batch_session_marks.filter((m) => m.person_id === "p1")).toHaveLength(1);
    const before = store.batch_session_marks.length;
    expect((await markPresentFromQuiz("s1", "p3", "adm")).ok).toBe(false);
    expect(store.batch_session_marks).toHaveLength(before);
  });
});

describe("getSessionQuiz and prepareReview", () => {
  it("tags recorded students in the saved results", async () => {
    store.batch_quiz_results.push(result("1", "s1", "p1", 80), result("3", "s1", "p3", 60));
    const q = await getSessionQuiz("s1");
    expect(q).toMatchObject({ saved: true, maxScore: 100, fileName: "a.xlsx" });
    expect(q.rows.map((r) => [r.personId, r.mode])).toEqual([["p1", "live"], ["p3", "recorded"]]);
  });

  it("builds a base with matches, a non-batch alias owner, and remembered decisions", async () => {
    store.batch_quiz_decisions.push({ id: "d", session_id: "s1", kind: "skip", key: "zeb", choice: "", person_id: null });
    const rows = [
      { line: 4, rank: 1, player: "Ayesha-1001n", score: 5, correct: 1, incorrect: 0, hint: "" },
      { line: 5, rank: 2, player: "Old-ID", score: 3, correct: 1, incorrect: 0, hint: "" },
      { line: 6, rank: 3, player: "Zeb", score: 0, correct: 0, incorrect: 20, hint: "" },
    ];
    const out = await prepareReview("s1", rows, 20);
    expect(out?.pageId).toBe("pg1");
    const base = out!.base;
    expect(base.rows[0].match).toMatchObject({ kind: "rejoin", personId: "p1" });
    expect(base.people.p4.mode).toBeNull(); // test registration: known person, not enrolled
    expect(base.prior.unknown).toEqual({ "6": "skip" });
    expect(base.questionCount).toBe(20);
    expect(await prepareReview("nope", rows, null)).toBeNull();
  });
});
