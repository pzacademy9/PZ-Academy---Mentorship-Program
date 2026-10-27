// tests/quiz-admin-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const h = vi.hoisted(() => ({
  admin: true,
  getSessionById: vi.fn(),
  prepareReview: vi.fn(),
  saveQuizResults: vi.fn(),
  listQuizWithoutCheckin: vi.fn(),
  markPresentFromQuiz: vi.fn(),
  getSessionQuiz: vi.fn(),
  getBatchLeaderboard: vi.fn(),
}));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/data/attendance", () => ({ getSessionById: h.getSessionById }));
vi.mock("@/lib/data/quiz-results", () => ({
  prepareReview: h.prepareReview,
  saveQuizResults: h.saveQuizResults,
  listQuizWithoutCheckin: h.listQuizWithoutCheckin,
  markPresentFromQuiz: h.markPresentFromQuiz,
  getSessionQuiz: h.getSessionQuiz,
  getBatchLeaderboard: h.getBatchLeaderboard,
}));

import { uploadKahootReport, saveReview, markFromQuiz, loadQuizPanel } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/quiz-actions";
import { buildBase, EMPTY_CHOICES, type PersonInfo } from "@/lib/quiz/review";

const PAGE = "00000000-0000-4000-8000-000000000001";
const OTHER_PAGE = "00000000-0000-4000-8000-000000000009";
const SESS = "00000000-0000-4000-8000-000000000002";
const PERSON = "00000000-0000-4000-8000-000000000003";

const hamid: PersonInfo = { personId: PERSON, pzId: "Hamid-4821", name: "Hamid Khan", mode: "live" };
const row = (line: number, player: string, score: number) => ({ line, rank: null, player, score, correct: 0, incorrect: 0, hint: "" });
const base = (rows = [row(4, "Hamid-4821", 100)]) =>
  buildBase(rows, new Map([["hamid-4821", PERSON]]), new Map([[PERSON, hamid]]), [], 20);

const csvForm = (text: string, name = "r.csv") => {
  const f = new FormData();
  f.set("file", new File([text], name));
  return f;
};

beforeEach(() => {
  Object.values(h).forEach((v) => typeof v === "function" && "mockReset" in v && v.mockReset());
  h.admin = true;
  h.getSessionById.mockResolvedValue({ id: SESS, page_id: PAGE });
  h.saveQuizResults.mockResolvedValue({ ok: true, saved: 1, notes: [] });
  h.listQuizWithoutCheckin.mockResolvedValue([]);
  h.markPresentFromQuiz.mockResolvedValue({ ok: true });
});

describe("admin guard", () => {
  it("refuses a non-admin on every action and touches nothing", async () => {
    h.admin = false;
    const results = [
      await uploadKahootReport(PAGE, SESS, csvForm("a")),
      await saveReview(PAGE, SESS, { base: base(), choices: EMPTY_CHOICES, maxScore: 100, fileName: "x" }),
      await markFromQuiz(PAGE, SESS, PERSON),
      await loadQuizPanel(PAGE, SESS),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(h.getSessionById).not.toHaveBeenCalled();
    expect(h.saveQuizResults).not.toHaveBeenCalled();
    expect(h.markPresentFromQuiz).not.toHaveBeenCalled();
  });

  it("refuses a session from a different batch", async () => {
    h.getSessionById.mockResolvedValue({ id: SESS, page_id: OTHER_PAGE });
    expect((await uploadKahootReport(PAGE, SESS, csvForm("a"))).ok).toBe(false);
    expect((await markFromQuiz(PAGE, SESS, PERSON)).ok).toBe(false);
    expect(h.prepareReview).not.toHaveBeenCalled();
  });

  it("refuses malformed ids", async () => {
    expect((await loadQuizPanel("x", "y")).ok).toBe(false);
    expect(h.getSessionById).not.toHaveBeenCalled();
  });
});

describe("uploadKahootReport", () => {
  it("refuses a 6 MB file before parsing", async () => {
    const f = new FormData();
    f.set("file", new File([new Uint8Array(6 * 1024 * 1024)], "big.csv"));
    const r = await uploadKahootReport(PAGE, SESS, f);
    expect(r.ok).toBe(false);
    expect(h.prepareReview).not.toHaveBeenCalled();
  });

  it("refuses a missing file and a wrong type with plain messages", async () => {
    expect((await uploadKahootReport(PAGE, SESS, new FormData())).ok).toBe(false);
    const r = await uploadKahootReport(PAGE, SESS, csvForm("a", "r.pdf"));
    expect(!r.ok && r.message).toMatch(/xlsx or .csv/);
  });

  it("parses a csv and returns the review base", async () => {
    h.prepareReview.mockImplementation(async (_s: string, rows: unknown[]) => ({ base: base(rows as ReturnType<typeof row>[]), pageId: PAGE }));
    const r = await uploadKahootReport(PAGE, SESS, csvForm("Rank,Player,Total Score,Correct,Incorrect\n1,Hamid-4821,900,9,1\n"));
    expect(r.ok && r.base.rows).toHaveLength(1);
    expect(r.ok && r.fileName).toBe("r.csv");
  });

  it("never leaks raw error text", async () => {
    h.prepareReview.mockRejectedValue(new Error("secret db detail"));
    const r = await uploadKahootReport(PAGE, SESS, csvForm("Rank,Player,Total Score\n1,A,1\n"));
    expect(!r.ok && r.message).not.toMatch(/secret/);
  });
});

describe("saveReview", () => {
  it("refuses while a problem is undecided and does not save", async () => {
    const b = base([row(4, "Hamid-4821", 100), row(5, "Hamid-4821n", 50)]);
    const r = await saveReview(PAGE, SESS, { base: b, choices: EMPTY_CHOICES, maxScore: 1000, fileName: "x" });
    expect(!r.ok && r.message).toMatch(/1 problem is still waiting/);
    expect(h.saveQuizResults).not.toHaveBeenCalled();
  });

  it("saves a decided review with a summary and remembered decisions", async () => {
    const b = base([row(4, "Hamid-4821", 100), row(5, "Hamid-4821n", 50)]);
    h.listQuizWithoutCheckin.mockResolvedValue([{ personId: PERSON, pzId: "Hamid-4821", name: "Hamid Khan" }]);
    const r = await saveReview(PAGE, SESS, { base: b, choices: { ...EMPTY_CHOICES, duplicate: { [PERSON]: "merge" } }, maxScore: 1000, fileName: "x.xlsx" });
    expect(r).toMatchObject({ ok: true, saved: 1, noCheckin: 1, summary: { saved: 1, merged: 1 } });
    const arg = h.saveQuizResults.mock.calls[0][1];
    expect(arg.rows).toEqual([{ personId: PERSON, score: 150, correct: 0, incorrect: 0, player: "Hamid-4821" }]);
    expect(arg.decisions).toEqual([{ kind: "duplicate", key: PERSON, choice: "merge", personId: PERSON }]);
  });

  it("returns a plain message for a malformed request instead of throwing", async () => {
    const r = await saveReview(PAGE, SESS, { base: {} as never, choices: EMPTY_CHOICES, maxScore: 1, fileName: "" });
    expect(r.ok).toBe(false);
    expect(h.saveQuizResults).not.toHaveBeenCalled();
  });

  it("passes a data-layer refusal through", async () => {
    h.saveQuizResults.mockResolvedValue({ ok: false, message: "The quiz maximum is lower than the top score." });
    const r = await saveReview(PAGE, SESS, { base: base(), choices: EMPTY_CHOICES, maxScore: 5, fileName: "x" });
    expect(!r.ok && r.message).toMatch(/maximum/);
  });
});

describe("markFromQuiz", () => {
  it("returns the data layer's refusal for a recorded-only student", async () => {
    h.markPresentFromQuiz.mockResolvedValue({ ok: false, message: "This student is not a live student of this batch." });
    expect((await markFromQuiz(PAGE, SESS, PERSON)).ok).toBe(false);
  });
  it("passes the admin id", async () => {
    await markFromQuiz(PAGE, SESS, PERSON);
    expect(h.markPresentFromQuiz).toHaveBeenCalledWith(SESS, PERSON, "admin-1");
  });
});
