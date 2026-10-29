import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let idCounter = 0;
let beforeUpdate: ((table: string) => void) | null = null;

/** Minimal in-memory stand-in for the Supabase query builder (only what batch-feedback.ts uses). */
function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  let orderBy: { col: string; asc: boolean } | null = null;
  let limitN: number | null = null;

  function run(): Row[] {
    const rows = (db[name] ??= []);
    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload as Row]).map((p) => ({
        id: `${name}-${++idCounter}`,
        ...p,
      }));
      rows.push(...list);
      return list;
    }
    if (op === "delete") {
      db[name] = rows.filter((r) => !filters.every((f) => f(r)));
      return [];
    }
    if (op === "update") beforeUpdate?.(name);
    let matched = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      for (const r of matched) Object.assign(r, payload);
      return matched;
    }
    if (orderBy) {
      const { col, asc } = orderBy;
      matched = [...matched].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1));
    }
    if (limitN != null) matched = matched.slice(0, limitN);
    return matched;
  }

  const b: Record<string, unknown> = {
    select: () => b,
    insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    update: (p: Row) => ((op = "update"), (payload = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    order: (col: string, o?: { ascending?: boolean }) => ((orderBy = { col, asc: o?.ascending !== false }), b),
    limit: (n: number) => ((limitN = n), b),
    single: async () => {
      const r = run()[0];
      return r ? { data: r, error: null } : { data: null, error: { message: "not found" } };
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => table(t) }) }));

const createFeedbackSession = vi.fn();
const updateFeedbackSessionQuestions = vi.fn();
const setFeedbackSessionCover = vi.fn();
const setFeedbackProgramCover = vi.fn();
const generateFeedbackShareToken = vi.fn();
const getFeedbackSessionDetail = vi.fn();
const getQuestionBank = vi.fn();
const deleteFeedbackSession = vi.fn();

vi.mock("@/lib/data/feedback-sessions", () => ({
  createFeedbackSession: (...a: unknown[]) => createFeedbackSession(...a),
  updateFeedbackSessionQuestions: (...a: unknown[]) => updateFeedbackSessionQuestions(...a),
  setFeedbackSessionCover: (...a: unknown[]) => setFeedbackSessionCover(...a),
  deleteFeedbackSession: (...a: unknown[]) => deleteFeedbackSession(...a),
}));
vi.mock("@/lib/data/feedback-programs", () => ({
  setFeedbackProgramCover: (...a: unknown[]) => setFeedbackProgramCover(...a),
}));
vi.mock("@/lib/data/feedback-share", () => ({
  generateFeedbackShareToken: (...a: unknown[]) => generateFeedbackShareToken(...a),
}));
vi.mock("@/lib/data/feedback-responses", () => ({
  getFeedbackSessionDetail: (...a: unknown[]) => getFeedbackSessionDetail(...a),
}));
vi.mock("@/lib/data/feedback-question-bank", () => ({
  getQuestionBank: () => getQuestionBank(),
}));

import {
  ensureClassFeedback,
  batchQuestionSet,
  createMissingFeedback,
  applyQuestionsToBatch,
  setBatchCover,
  type BatchFeedbackSetup,
} from "@/lib/data/batch-feedback";

const QS: BatchFeedbackSetup["questions"] = [
  { text: "Q1", type: "stars" },
  { text: "Q2", type: "stars" },
  { text: "Q3", type: "video" },
];

function setup(type: BatchFeedbackSetup["type"] = "course"): BatchFeedbackSetup {
  return { type, questions: QS, coverUrl: null };
}

function seedBatch(kind = "course") {
  db.landing_pages = [{ id: "p1", title: "AMS Batch 1", kind, feedback_program_id: null, class_cover_url: null }];
  db.batch_sessions = [
    { id: "s1", page_id: "p1", number: 1, title: "", speaker: "Dr Ali", starts_at: "2026-11-03T15:00:00Z", feedback_session_id: null },
    { id: "s2", page_id: "p1", number: 2, title: "Pharmacology", speaker: "", starts_at: "2026-11-04T20:30:00Z", feedback_session_id: null },
  ];
  db.feedback_sessions = [];
  db.feedback_programs = [];
  db.feedback_questions = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  beforeUpdate = null;
  deleteFeedbackSession.mockImplementation(async (id: string) => {
    db.feedback_sessions = db.feedback_sessions.filter((r) => r.id !== id);
  });
  idCounter = 0;
  for (const k of Object.keys(db)) delete db[k];
  seedBatch();
  createFeedbackSession.mockImplementation(async (input: { name: string }) => {
    const id = `fs-${++idCounter}`;
    const slug = `slug-${id}`;
    db.feedback_sessions.push({ id, slug, name: input.name });
    return { id, slug };
  });
  generateFeedbackShareToken.mockResolvedValue({ shareUrl: "/review/sh_x", token: "sh_x" });
  getQuestionBank.mockResolvedValue([
    { text: "B1", type: "stars", order: 1 },
    { text: "B2", type: "stars", order: 2 },
    { text: "B3", type: "video", order: 3 },
    { text: "B4", type: "stars", order: 4 },
  ]);
});

describe("ensureClassFeedback", () => {
  it("second call for same class creates nothing", async () => {
    const first = await ensureClassFeedback("p1", "s1", setup(), "actor");
    const second = await ensureClassFeedback("p1", "s1", setup(), "actor");
    expect(second).toEqual(first);
    expect(createFeedbackSession).toHaveBeenCalledTimes(1);
    expect(db.feedback_programs).toHaveLength(1);
  });

  it("webinar creates a session and no program", async () => {
    seedBatch("webinar");
    const res = await ensureClassFeedback("p1", "s1", setup("webinar"), "actor");
    expect(res.feedbackSessionId).toBeTruthy();
    expect(db.feedback_programs).toHaveLength(0);
    expect(createFeedbackSession.mock.calls[0][0].programId).toBeNull();
    expect(db.batch_sessions[0].feedback_session_id).toBe(res.feedbackSessionId);
  });

  it("course creates one program for many classes", async () => {
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    await ensureClassFeedback("p1", "s2", setup(), "actor");
    expect(db.feedback_programs).toHaveLength(1);
    expect(db.feedback_programs[0]).toMatchObject({ name: "AMS Batch 1", type: "course" });
    expect(generateFeedbackShareToken).toHaveBeenCalledWith("program", db.feedback_programs[0].id, "actor");
    const progId = db.feedback_programs[0].id;
    expect(db.landing_pages[0].feedback_program_id).toBe(progId);
    expect(createFeedbackSession.mock.calls[0][0]).toMatchObject({ programId: progId, programOrder: 1, randomizeSlug: true });
    expect(createFeedbackSession.mock.calls[1][0]).toMatchObject({ programId: progId, programOrder: 2 });
  });

  it("blank speaker becomes PZ Academy", async () => {
    await ensureClassFeedback("p1", "s2", setup(), "actor");
    expect(createFeedbackSession.mock.calls[0][0].speakerName).toBe("PZ Academy");
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    expect(createFeedbackSession.mock.calls[1][0].speakerName).toBe("Dr Ali");
  });

  it("name uses topic when given, otherwise Day N", async () => {
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    await ensureClassFeedback("p1", "s2", setup(), "actor");
    expect(createFeedbackSession.mock.calls[0][0].name).toBe("AMS Batch 1 - Day 1");
    expect(createFeedbackSession.mock.calls[1][0].name).toBe("AMS Batch 1 - Pharmacology");
    // 2026-11-04T20:30Z is 2026-11-05 01:30 PKT
    expect(createFeedbackSession.mock.calls[1][0].sessionDate).toBe("2026-11-05");
  });

  it("applies the cover to the new session when given", async () => {
    await ensureClassFeedback("p1", "s1", { ...setup(), coverUrl: "https://x/c.jpg" }, "actor");
    expect(setFeedbackSessionCover).toHaveBeenCalledTimes(1);
    expect(setFeedbackSessionCover.mock.calls[0][1]).toBe("https://x/c.jpg");
    expect(setFeedbackProgramCover).not.toHaveBeenCalled(); // spec call 13: no program cover at creation
  });
});

describe("batch question set and bulk actions", () => {
  async function createBoth() {
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    await ensureClassFeedback("p1", "s2", setup(), "actor");
  }

  it("batchQuestionSet reads the first session's questions", async () => {
    await createBoth();
    db.feedback_questions = [
      { id: "a", feedback_session_id: db.batch_sessions[0].feedback_session_id, text: "Q1", type: "stars", question_order: 1 },
      { id: "b", feedback_session_id: db.batch_sessions[0].feedback_session_id, text: "Q2", type: "video", question_order: 2 },
    ];
    expect(await batchQuestionSet("p1")).toEqual([
      { text: "Q1", type: "stars" },
      { text: "Q2", type: "video" },
    ]);
  });

  it("question update skips classes that have responses", async () => {
    await createBoth();
    const [a, b] = db.batch_sessions.map((s) => s.feedback_session_id);
    getFeedbackSessionDetail.mockImplementation(async (id: string) => ({
      session: { id, responseCount: id === a ? 2 : 0 },
    }));
    const res = await applyQuestionsToBatch("p1", QS, "actor");
    expect(res).toEqual({ updated: 1, skipped: 1 });
    expect(updateFeedbackSessionQuestions).toHaveBeenCalledTimes(1);
    expect(updateFeedbackSessionQuestions.mock.calls[0][0]).toBe(b);
  });

  it("createMissingFeedback only touches classes without feedback", async () => {
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    const existing = db.batch_sessions[0].feedback_session_id;
    db.feedback_questions = [
      { id: "a", feedback_session_id: existing, text: "Q1", type: "stars", question_order: 1 },
      { id: "b", feedback_session_id: existing, text: "Q2", type: "stars", question_order: 2 },
      { id: "c", feedback_session_id: existing, text: "Q3", type: "stars", question_order: 3 },
    ];
    createFeedbackSession.mockClear();
    const res = await createMissingFeedback("p1", "actor");
    expect(res).toEqual({ created: 1 });
    expect(createFeedbackSession).toHaveBeenCalledTimes(1);
    expect(createFeedbackSession.mock.calls[0][0].questions.map((q: { text: string }) => q.text)).toEqual(["Q1", "Q2", "Q3"]);
    expect(db.feedback_programs).toHaveLength(1);
  });

  it("createMissingFeedback falls back to the first 3 bank questions when the batch has none", async () => {
    const res = await createMissingFeedback("p1", "actor");
    expect(res).toEqual({ created: 2 });
    expect(createFeedbackSession.mock.calls[0][0].questions.map((q: { text: string }) => q.text)).toEqual(["B1", "B2", "B3"]);
  });

  it("setBatchCover writes page, program and every session", async () => {
    await createBoth();
    await setBatchCover("p1", "https://x/c.jpg", "actor");
    expect(db.landing_pages[0].class_cover_url).toBe("https://x/c.jpg");
    expect(setFeedbackProgramCover).toHaveBeenCalledWith(db.feedback_programs[0].id, "https://x/c.jpg", "actor");
    expect(setFeedbackSessionCover).toHaveBeenCalledTimes(2);
  });
});

describe("idempotency under races and retries", () => {
  it("write-back conflict deletes the loser session and returns the winner's", async () => {
    db.feedback_sessions.push({ id: "winner", slug: "winner-slug", name: "w" });
    beforeUpdate = (table) => {
      if (table === "batch_sessions") {
        db.batch_sessions[0].feedback_session_id = "winner";
        beforeUpdate = null;
      }
    };
    const res = await ensureClassFeedback("p1", "s1", setup("workshop"), "actor");
    expect(res).toEqual({ feedbackSessionId: "winner", slug: "winner-slug" });
    expect(deleteFeedbackSession).toHaveBeenCalledTimes(1);
    expect(db.batch_sessions[0].feedback_session_id).toBe("winner");
    expect(setFeedbackSessionCover).not.toHaveBeenCalled();
  });

  it("cover failure keeps the link and a retry creates nothing new", async () => {
    setFeedbackSessionCover.mockRejectedValueOnce(new Error("boom"));
    const first = await ensureClassFeedback("p1", "s1", { ...setup(), coverUrl: "https://x/c.jpg" }, "actor");
    expect(db.batch_sessions[0].feedback_session_id).toBe(first.feedbackSessionId);
    const second = await ensureClassFeedback("p1", "s1", { ...setup(), coverUrl: "https://x/c.jpg" }, "actor");
    expect(second).toEqual(first);
    expect(createFeedbackSession).toHaveBeenCalledTimes(1);
  });

  it("program race leaves one program and deletes the loser", async () => {
    db.feedback_programs.push({ id: "prog-winner", name: "AMS Batch 1", type: "course" });
    beforeUpdate = (table) => {
      if (table === "landing_pages") {
        db.landing_pages[0].feedback_program_id = "prog-winner";
        beforeUpdate = null;
      }
    };
    await ensureClassFeedback("p1", "s1", setup(), "actor");
    expect(db.feedback_programs.map((p) => p.id)).toEqual(["prog-winner"]);
    expect(createFeedbackSession.mock.calls[0][0].programId).toBe("prog-winner");
    expect(generateFeedbackShareToken).not.toHaveBeenCalled();
  });

  it("createMissingFeedback on a course page with no program creates the program and groups sessions", async () => {
    const res = await createMissingFeedback("p1", "actor");
    expect(res).toEqual({ created: 2 });
    expect(db.feedback_programs).toHaveLength(1);
    expect(db.feedback_programs[0]).toMatchObject({ type: "course" });
    const progId = db.feedback_programs[0].id;
    expect(createFeedbackSession.mock.calls.every((c) => c[0].programId === progId)).toBe(true);
  });
});
