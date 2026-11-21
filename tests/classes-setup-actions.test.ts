// tests/classes-setup-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const h = vi.hoisted(() => ({
  admin: true,
  ensure: vi.fn(),
  cover: vi.fn(),
  questions: vi.fn(),
  missing: vi.fn(),
  applyQuestions: vi.fn(),
}));
const db = createSupabaseMock();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/data/batch-feedback", () => ({
  ensureClassFeedback: h.ensure,
  setBatchCover: h.cover,
  batchQuestionSet: h.questions,
  createMissingFeedback: h.missing,
  applyQuestionsToBatch: h.applyQuestions,
}));

import {
  loadSetup, saveSetup, saveDefaults, createMissingFeedbackAction,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";

const PAGE = "00000000-0000-4000-8000-000000000001";
const defaults = { start: "20:00", end: "21:30", zoom: "https://zoom.us/j/9", checkinOpen: 15, checkinClose: 15 };
const QS = [{ text: "How was it?", type: "stars" as const }];
const iso = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:00`).toISOString();

let store: Store;
const form = (over: Record<string, unknown> = {}) => ({
  days: [{ date: "2026-11-03" }, { date: "2026-11-04" }, { date: "2026-11-05" }],
  defaults,
  coverUrl: null,
  questions: QS,
  confirmRemoveIds: [] as string[],
  ...over,
});
const cls = (n: number, date: string, over: Record<string, unknown> = {}) => ({
  id: `c${n}`, page_id: PAGE, number: n, title: "", speaker: "",
  starts_at: iso(date, "20:00"), ends_at: iso(date, "21:30"), zoom_url: defaults.zoom,
  custom_time: false, custom_zoom: false, feedback_session_id: null, ...over,
});

beforeEach(() => {
  h.admin = true;
  db.reset();
  for (const v of [h.ensure, h.cover, h.questions, h.missing, h.applyQuestions]) v.mockReset();
  store = {
    landing_pages: [{
      id: PAGE, title: "PPC Batch", kind: "course", feedback_program_id: null, class_cover_url: null,
      class_default_start: null, class_default_end: null, class_default_zoom: "",
    }],
    batch_sessions: [],
    batch_session_marks: [],
    batch_quiz_results: [],
    feedback_responses: [],
    feedback_sessions: [],
  };
  db.state.handler = memoryHandler(store);
  h.questions.mockResolvedValue([]);
  h.cover.mockResolvedValue(undefined);
  h.applyQuestions.mockResolvedValue({ updated: 0, skipped: 0 });
  h.missing.mockResolvedValue({ created: 2 });
  h.ensure.mockImplementation(async (_p: string, sessionId: string) => {
    const row = store.batch_sessions.find((r) => r.id === sessionId);
    if (!row) throw new Error("no class");
    if (!row.feedback_session_id) {
      const fs = { id: `fs-${sessionId}`, slug: `slug-${sessionId}` };
      store.feedback_sessions.push(fs);
      row.feedback_session_id = fs.id;
    }
    return { feedbackSessionId: row.feedback_session_id, slug: "x" };
  });
});

describe("saveSetup", () => {
  it("saveSetup creates classes and feedback for each", async () => {
    const r = await saveSetup(PAGE, form());
    expect(r.ok).toBe(true);
    expect(store.batch_sessions.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(store.batch_sessions[0]).toMatchObject({
      starts_at: iso("2026-11-03", "20:00"), ends_at: iso("2026-11-03", "21:30"),
      zoom_url: defaults.zoom, custom_time: false, custom_zoom: false,
    });
    expect(h.ensure).toHaveBeenCalledTimes(3);
    expect(h.ensure.mock.calls[0][2]).toMatchObject({ type: "course", questions: QS });
    expect(h.cover).not.toHaveBeenCalled();
    expect(store.landing_pages[0]).toMatchObject({
      class_default_start: "20:00", class_default_end: "21:30", class_default_zoom: defaults.zoom,
    });
    expect(store.landing_pages[0].kind).toBe("course");
  });

  it("saveSetup twice makes no duplicates", async () => {
    await saveSetup(PAGE, form());
    const r = await saveSetup(PAGE, form());
    expect(r.ok).toBe(true);
    expect(store.batch_sessions).toHaveLength(3);
    expect(store.batch_sessions.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(store.feedback_sessions).toHaveLength(3);
  });

  it("removing a class with marks is refused without confirmation", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04")];
    store.batch_session_marks = [{ id: "m1", session_id: "c2", person_id: "p1" }];
    const days = [{ date: "2026-11-03", existingId: "c1" }];

    const refused = await saveSetup(PAGE, form({ days }));
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("Day 2");
    expect(refused.message).toContain("not removed");
    expect(store.batch_sessions).toHaveLength(2);
    expect(db.find("batch_session_marks", "select")).toHaveLength(1);
    expect(db.find("batch_quiz_results", "select")).toHaveLength(1);

    const done = await saveSetup(PAGE, form({ days, confirmRemoveIds: ["c2"] }));
    expect(done.ok).toBe(true);
    expect(store.batch_sessions.map((c) => c.id)).toEqual(["c1"]);
  });

  it("removing a class with feedback responses is refused too", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04", { feedback_session_id: "fs2" })];
    store.feedback_responses = [{ id: "r1", feedback_session_id: "fs2" }];
    const r = await saveSetup(PAGE, form({ days: [{ date: "2026-11-03", existingId: "c1" }] }));
    expect(r.ok).toBe(false);
    expect(store.batch_sessions).toHaveLength(2);
  });

  it("a confirmed removal keeps a feedback session that has answers and explains the loss", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04", { feedback_session_id: "fs2" })];
    store.feedback_sessions = [{ id: "fs2", slug: "s2" }];
    store.feedback_responses = [{ id: "r1", feedback_session_id: "fs2" }];
    const days = [{ date: "2026-11-03", existingId: "c1" }];
    const refused = await saveSetup(PAGE, form({ days }));
    expect(refused.message).toContain("attendance marks and quiz results");
    expect(refused.message).toContain("feedback link");
    expect(refused.message).toContain("Admin > Feedback");
    const done = await saveSetup(PAGE, form({ days, confirmRemoveIds: ["c2"] }));
    expect(done.ok).toBe(true);
    expect(store.batch_sessions.map((c) => c.id)).toEqual(["c1"]);
    expect(store.feedback_sessions.map((f) => f.id)).toContain("fs2");
    expect(store.feedback_responses).toHaveLength(1);
  });

  it("removing a class with no answers deletes its feedback session", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04", { feedback_session_id: "fs2" })];
    store.feedback_sessions = [{ id: "fs2", slug: "s2" }];
    const r = await saveSetup(PAGE, form({ days: [{ date: "2026-11-03", existingId: "c1" }] }));
    expect(r.ok).toBe(true);
    expect(store.feedback_sessions.map((f) => f.id)).not.toContain("fs2");
  });

  it("a feedback delete failure does not fail the save", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04", { feedback_session_id: "fs2" })];
    store.feedback_sessions = [{ id: "fs2", slug: "s2" }];
    const inner = memoryHandler(store);
    db.state.handler = (op) => op.table === "feedback_sessions" && op.op === "delete"
      ? { data: null, error: { message: "fk" } }
      : inner(op);
    const r = await saveSetup(PAGE, form({ days: [{ date: "2026-11-03", existingId: "c1" }] }));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Day 2");
    expect(store.batch_sessions.map((c) => c.id)).toEqual(["c1"]);
  });

  it("rejects a cover that is not from the picture library, and clears on empty", async () => {
    for (const bad of ["http://169.254.169.254/", "https://evil.example/x.png", "http://drive.google.com/thumbnail?id=abc", "not a url"]) {
      const r = await saveSetup(PAGE, form({ coverUrl: bad }));
      expect(r.ok).toBe(false);
      expect(r.message).toBe("Please pick the cover from the picture library.");
    }
    expect(store.batch_sessions).toHaveLength(0);
    expect((await saveSetup(PAGE, form({ coverUrl: "https://drive.google.com/thumbnail?id=abcdefghij&sz=w1600" }))).ok).toBe(true);
    expect(h.cover).toHaveBeenLastCalledWith(PAGE, "https://drive.google.com/thumbnail?id=abcdefghij&sz=w1600", "admin-1");
    store.landing_pages[0].class_cover_url = "https://drive.google.com/thumbnail?id=abcdefghij&sz=w1600";
    expect((await saveSetup(PAGE, form({ coverUrl: "" }))).ok).toBe(true);
    expect(h.cover).toHaveBeenLastCalledWith(PAGE, null, "admin-1");
  });

  it("removing an empty class works without confirmation", async () => {
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04")];
    const r = await saveSetup(PAGE, form({ days: [{ date: "2026-11-03", existingId: "c1" }] }));
    expect(r.ok).toBe(true);
    expect(store.batch_sessions.map((c) => c.id)).toEqual(["c1"]);
  });

  it("non-admin is refused", async () => {
    h.admin = false;
    const results = [
      await saveSetup(PAGE, form()),
      await saveDefaults(PAGE, defaults),
      await createMissingFeedbackAction(PAGE),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(store.batch_sessions).toHaveLength(0);
    expect(h.ensure).not.toHaveBeenCalled();
    expect(h.missing).not.toHaveBeenCalled();
  });

  it("uses the page kind and refuses a webinar with several days", async () => {
    store.landing_pages[0].kind = "webinar";
    const r = await saveSetup(PAGE, form());
    expect(r.ok).toBe(false);
    expect(store.batch_sessions).toHaveLength(0);
  });

  it("a webinar that already has two classes saves without the one-day error and keeps both", async () => {
    store.landing_pages[0].kind = "webinar";
    store.batch_sessions = [cls(1, "2026-11-03"), cls(2, "2026-11-04")];
    const r = await saveSetup(PAGE, form({
      days: [{ date: "2026-11-03", existingId: "c1" }, { date: "2026-11-04", existingId: "c2" }],
    }));
    expect(r.ok).toBe(true);
    expect(store.batch_sessions).toHaveLength(2);
  });

  it("an old custom class with no end time saves without error and stays without an end", async () => {
    store.batch_sessions = [cls(1, "2026-11-03", { custom_time: true, starts_at: iso("2026-11-03", "21:00"), ends_at: null })];
    const r = await saveSetup(PAGE, form({
      days: [{ date: "2026-11-03", existingId: "c1", start: "21:00" }],
    }));
    expect(r.ok).toBe(true);
    expect(store.batch_sessions[0].ends_at).toBeNull();
    expect(store.batch_sessions[0].starts_at).toBe(iso("2026-11-03", "21:00"));
  });

  it("does not touch the batch cover when it did not change", async () => {
    store.landing_pages[0].class_cover_url = "https://drive.google.com/thumbnail?id=abc";
    const r = await saveSetup(PAGE, form({ coverUrl: " https://drive.google.com/thumbnail?id=abc " }));
    expect(r.ok).toBe(true);
    expect(h.cover).not.toHaveBeenCalled();
  });

  it("sets the batch cover when it changed or was cleared", async () => {
    store.landing_pages[0].class_cover_url = "https://drive.google.com/thumbnail?id=abc";
    await saveSetup(PAGE, form({ coverUrl: null }));
    expect(h.cover).toHaveBeenCalledWith(PAGE, null, "admin-1");
  });

  it("keeps a class's own time when the form sends it back", async () => {
    store.batch_sessions = [cls(1, "2026-11-03", { custom_time: true, starts_at: iso("2026-11-03", "18:00"), ends_at: iso("2026-11-03", "19:00") })];
    const r = await saveSetup(PAGE, form({
      days: [{ date: "2026-11-03", existingId: "c1", start: "18:00", end: "19:00" }],
    }));
    expect(r.ok).toBe(true);
    expect(store.batch_sessions[0]).toMatchObject({ custom_time: true, starts_at: iso("2026-11-03", "18:00") });
  });
});

describe("saveDefaults check-in window", () => {
  it("rejects 181, -1 and 1.5 and writes nothing", async () => {
    for (const bad of [181, -1, 1.5]) {
      const r = await saveDefaults(PAGE, { ...defaults, checkinOpen: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/whole number/i);
      const r2 = await saveDefaults(PAGE, { ...defaults, checkinClose: bad });
      expect(r2.ok).toBe(false);
    }
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("accepts 0 and stores both numbers", async () => {
    Object.assign(store.landing_pages[0], { checkin_open_minutes: 15, checkin_close_minutes: 15 });
    const r = await saveDefaults(PAGE, { ...defaults, checkinOpen: 0, checkinClose: 45 });
    expect(r.ok).toBe(true);
    expect(store.landing_pages[0]).toMatchObject({ checkin_open_minutes: 0, checkin_close_minutes: 45 });
  });
  it("a numeric string or one-item array is stored as the parsed number", async () => {
    Object.assign(store.landing_pages[0], { checkin_open_minutes: 15, checkin_close_minutes: 15 });
    const r = await saveDefaults(PAGE, { ...defaults, checkinOpen: "20" as unknown as number, checkinClose: [5] as unknown as number });
    expect(r.ok).toBe(true);
    expect(store.landing_pages[0]).toMatchObject({ checkin_open_minutes: 20, checkin_close_minutes: 5 });
    const r2 = await saveSetup(PAGE, form({ defaults: { ...defaults, checkinOpen: "25" as unknown as number } }));
    expect(r2.ok).toBe(true);
    expect(store.landing_pages[0]).toMatchObject({ checkin_open_minutes: 25, checkin_close_minutes: 15 });
  });
  it("a string that is not a whole number is rejected and nothing is written", async () => {
    const r = await saveDefaults(PAGE, { ...defaults, checkinOpen: "20x" as unknown as number });
    expect(r.ok).toBe(false);
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("saveSetup rejects a bad window and writes nothing", async () => {
    const r = await saveSetup(PAGE, form({ defaults: { ...defaults, checkinClose: 200 } }));
    expect(r.ok).toBe(false);
    expect(store.batch_sessions).toHaveLength(0);
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("before the migration: 15 and 15 saves without checkin keys", async () => {
    const r = await saveDefaults(PAGE, defaults);
    expect(r.ok).toBe(true);
    const upd = db.find("landing_pages", "update");
    expect(upd).toHaveLength(1);
    expect(Object.keys(upd[0].payload as object).some((k) => k.startsWith("checkin_"))).toBe(false);
  });
  it("before the migration: 20 and 15 returns the plain message and writes nothing", async () => {
    const r = await saveDefaults(PAGE, { ...defaults, checkinOpen: 20 });
    expect(r).toEqual({ ok: false, message: "Check-in minutes need a database update first. Ask for the SQL." });
    expect(db.find("landing_pages", "update")).toHaveLength(0);
    const r2 = await saveSetup(PAGE, form({ defaults: { ...defaults, checkinOpen: 20 } }));
    expect(r2.ok).toBe(false);
    expect(store.batch_sessions).toHaveLength(0);
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("with the columns, the payload includes them and 0 is kept", async () => {
    Object.assign(store.landing_pages[0], { checkin_open_minutes: 15, checkin_close_minutes: 15 });
    await saveDefaults(PAGE, { ...defaults, checkinOpen: 0 });
    const upd = db.find("landing_pages", "update");
    expect(upd[0].payload).toMatchObject({ checkin_open_minutes: 0, checkin_close_minutes: 15 });
  });
  it("loadSetup returns them, 15 and 15 when the columns are missing", async () => {
    Object.assign(store.landing_pages[0], { class_default_start: "20:00:00", class_default_end: "21:30:00", class_default_zoom: "" });
    expect((await loadSetup(PAGE))?.defaults).toMatchObject({ checkinOpen: 15, checkinClose: 15 });
    Object.assign(store.landing_pages[0], { checkin_open_minutes: 0, checkin_close_minutes: 40 });
    expect((await loadSetup(PAGE))?.defaults).toMatchObject({ checkinOpen: 0, checkinClose: 40 });
  });
});

describe("saveDefaults", () => {
  it("saveDefaults leaves custom classes alone", async () => {
    store.batch_sessions = [
      cls(1, "2026-11-03"),
      cls(2, "2026-11-04", { custom_time: true, custom_zoom: true, starts_at: iso("2026-11-04", "18:00"), ends_at: iso("2026-11-04", "19:00"), zoom_url: "https://zoom.us/j/own" }),
    ];
    const r = await saveDefaults(PAGE, { start: "19:00", end: "20:00", zoom: "https://zoom.us/j/new", checkinOpen: 15, checkinClose: 15 });
    expect(r.ok).toBe(true);
    expect(store.batch_sessions[0]).toMatchObject({
      starts_at: iso("2026-11-03", "19:00"), ends_at: iso("2026-11-03", "20:00"), zoom_url: "https://zoom.us/j/new",
    });
    expect(store.batch_sessions[1]).toMatchObject({
      starts_at: iso("2026-11-04", "18:00"), zoom_url: "https://zoom.us/j/own",
    });
    expect(store.landing_pages[0]).toMatchObject({ class_default_start: "19:00", class_default_zoom: "https://zoom.us/j/new" });
  });

  it("says the batch was not found for an unknown page", async () => {
    store.landing_pages = [];
    expect(await saveDefaults(PAGE, defaults)).toEqual({ ok: false, message: "That batch was not found" });
  });

  it("rejects a bad time", async () => {
    const r = await saveDefaults(PAGE, { start: "25:00", end: "20:00", zoom: "", checkinOpen: 15, checkinClose: 15 });
    expect(r.ok).toBe(false);
  });
});

describe("loadSetup", () => {
  it("loadSetup derives webinar for one class and no program", async () => {
    store.landing_pages[0].kind = "webinar";
    store.batch_sessions = [cls(1, "2026-11-03")];
    const s = await loadSetup(PAGE);
    expect(s?.type).toBe("webinar");
    expect(s?.classes).toHaveLength(1);
    expect(s?.classes[0]).toMatchObject({ date: "2026-11-03", hasData: false });
  });

  it("returns own values only for custom classes, hasData in batches, and trims defaults", async () => {
    Object.assign(store.landing_pages[0], { class_default_start: "20:00:00", class_default_end: "21:30:00", class_default_zoom: defaults.zoom });
    store.batch_sessions = [
      cls(1, "2026-11-03"),
      cls(2, "2026-11-04", { custom_time: true, custom_zoom: true, starts_at: iso("2026-11-04", "18:00"), ends_at: iso("2026-11-04", "19:00"), zoom_url: "https://zoom.us/j/own" }),
      cls(3, "2026-11-05", { feedback_session_id: "fs3" }),
    ];
    store.batch_quiz_results = [{ id: "q1", session_id: "c1" }];
    store.feedback_responses = [{ id: "r1", feedback_session_id: "fs3" }];
    const s = await loadSetup(PAGE);
    expect(s?.defaults).toEqual(defaults);
    expect(s?.classes.map((c) => c.hasData)).toEqual([true, false, true]);
    expect(s?.classes[0].ownStart).toBeUndefined();
    expect(s?.classes[1]).toMatchObject({ ownStart: "18:00", ownEnd: "19:00", ownZoom: "https://zoom.us/j/own" });
    expect(db.find("batch_session_marks", "select")).toHaveLength(1);
    expect(db.find("batch_quiz_results", "select")).toHaveLength(1);
    expect(db.find("feedback_responses", "select")).toHaveLength(1);
  });

  it("returns null for an unknown batch", async () => {
    store.landing_pages = [];
    expect(await loadSetup(PAGE)).toBeNull();
  });
});

describe("createMissingFeedbackAction", () => {
  it("reports how many were created", async () => {
    const r = await createMissingFeedbackAction(PAGE);
    expect(r.ok).toBe(true);
    expect(h.missing).toHaveBeenCalledWith(PAGE, "admin-1");
  });
});
