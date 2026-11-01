// tests/portal-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { listPortalBatches, getPortalBatch, getProgressForEmail } from "@/lib/data/portal";

const NOW = new Date("2026-11-01T12:00:00Z");
const PAST = "2026-10-01T10:00:00Z";
const PAST2 = "2026-10-02T10:00:00Z";
const FUTURE = "2026-12-01T10:00:00Z";

const reg = (id: string, page: string, person: string | null, over: Record<string, unknown> = {}) => ({
  id, page_id: page, person_id: person, status: "paid", is_test: false,
  option_label: "Live - Full Course", mode: "live", email: `${person}@example.com`, ...over,
});

const seed = (): Store => ({
  pz_people: [
    { id: "me", pz_id: "Sample-0000", display_name: "Sample Surname" },
    { id: "other", pz_id: "Name-0001", display_name: "Other Person" },
    { id: "rec", pz_id: "Name-0002", display_name: "Rec Student" },
    { id: "pend", pz_id: "Name-0003", display_name: "Pending Person" },
    { id: "tst", pz_id: "Name-0004", display_name: "Test Person" },
    { id: "stray", pz_id: "Name-0005", display_name: "Stray Person" },
    { id: "blank", pz_id: "Name-0006", display_name: "   " },
  ],
  pz_person_emails: [{ email: "me@example.com", person_id: "me" }],
  landing_pages: [
    { id: "pc", title: "Course A", slug: "course-a", status: "published", kind: "course", attendance_min_pct: 70 },
    { id: "pd", title: "Draft C", slug: "draft-c", status: "draft", kind: "course", attendance_min_pct: 75 },
    { id: "pk", title: "Other Kind", slug: "other-kind", status: "published", kind: "page", attendance_min_pct: 75 },
  ],
  landing_registrations: [
    reg("r1", "pc", "me"),
    reg("r2", "pc", "other"),
    reg("r3", "pc", "rec", { status: "free", mode: "recorded", option_label: "Recorded - Full Course" }),
    reg("r4", "pc", "pend", { status: "pending" }),
    reg("r5", "pc", "tst", { is_test: true }),
    reg("r6", "pc", "blank"),
    reg("r7", "pd", "me"),
    reg("r8", "pk", "me"),
  ],
  batch_sessions: [
    { id: "s1", page_id: "pc", number: 1, title: "Class one", starts_at: PAST, audience: null, quiz_max_score: 100 },
    { id: "s2", page_id: "pc", number: 2, title: "Class two", starts_at: PAST2, audience: null, quiz_max_score: 100 },
    { id: "s3", page_id: "pc", number: 3, title: "Class three", starts_at: FUTURE, audience: null, quiz_max_score: null },
    { id: "sx", page_id: "pc", number: 4, title: "Unreadable", starts_at: PAST, audience: { garbage: true }, quiz_max_score: null },
    { id: "sd", page_id: "pd", number: 1, title: "Draft class", starts_at: PAST, audience: null, quiz_max_score: null },
  ],
  batch_session_marks: [
    { id: "m1", session_id: "s1", person_id: "me", source: "personal" },
    { id: "m2", session_id: "s2", person_id: "other", source: "admin" },
    { id: "m3", session_id: "s1", person_id: "pend", source: "admin" },
  ],
  batch_quiz_results: [
    { id: "q1", session_id: "s2", person_id: "me", score: 80 },
    { id: "q2", session_id: "s2", person_id: "other", score: 90 },
    { id: "q3", session_id: "s2", person_id: "rec", score: 99 },
    { id: "q4", session_id: "s2", person_id: "stray", score: 70 },
    { id: "q5", session_id: "s1", person_id: "pend", score: 60 },
  ],
  pz_id_aliases: [],
});

beforeEach(() => {
  db.reset();
  db.state.handler = memoryHandler(seed());
});

describe("listPortalBatches", () => {
  it("omits drafts and wrong kinds, and counts enrolled people and classes", async () => {
    const cards = await listPortalBatches(NOW);
    expect(cards.map((c) => c.slug)).toEqual(["course-a"]);
    expect(cards[0]).toMatchObject({ students: 3, classesHeld: 2, classesTotal: 3, lastClassAt: FUTURE });
  });

  it("rejects when a read fails", async () => {
    const ok = db.state.handler;
    db.state.handler = (op) => (op.table === "batch_sessions" ? { data: null, error: { message: "boom" } } : ok(op));
    await expect(listPortalBatches(NOW)).rejects.toThrow();
  });
});

describe("getPortalBatch", () => {
  it("returns exactly the enrolled people with first names only and no emails", async () => {
    const view = (await getPortalBatch("course-a", NOW))!;
    expect(view.attendance.map((r) => r.pzId).sort()).toEqual(["Name-0001", "Name-0002", "Sample-0000"]);
    expect(view.attendance.map((r) => r.firstName).sort()).toEqual(["Other", "Rec", "Sample"]);
    expect(view.sessions.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(view.overall.map((r) => r.pzId)).toEqual(["Name-0001", "Sample-0000", "Name-0002"]);
    const text = JSON.stringify(view);
    expect(text).not.toContain("@");
    expect(text).not.toContain("Surname");
    for (const gone of ["Name-0003", "Name-0004", "Name-0005", "Name-0006"]) expect(text).not.toContain(gone);
  });

  it("leaves out a class whose stored audience cannot be read", async () => {
    const view = (await getPortalBatch("course-a", NOW))!;
    expect(view.sessions.map((s) => s.id)).not.toContain("sx");
  });

  it("returns null for unknown, draft and wrong-kind slugs", async () => {
    for (const slug of ["nope", "draft-c", "other-kind"]) expect(await getPortalBatch(slug, NOW)).toBeNull();
  });

  it("rejects when a read fails", async () => {
    const ok = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_registrations" ? { data: null, error: { message: "boom" } } : ok(op));
    await expect(getPortalBatch("course-a", NOW)).rejects.toThrow();
  });
});

describe("getProgressForEmail", () => {
  it("matches case-insensitively and returns that person's progress", async () => {
    const out = await getProgressForEmail("  Me@Example.com ", NOW);
    expect(out?.pzId).toBe("Sample-0000");
    expect(out?.firstName).toBe("Sample");
  });
  it("returns null for an unknown email", async () => {
    expect(await getProgressForEmail("nobody@example.com", NOW)).toBeNull();
  });
});
