// tests/progress-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getProgressByPzId } from "@/lib/data/progress";

const NOW = new Date("2026-11-01T12:00:00Z");
const PAST = "2026-10-01T10:00:00Z";
const PAST2 = "2026-10-02T10:00:00Z";
const FUTURE = "2026-12-01T10:00:00Z";

const seed = (): Store => ({
  pz_people: [
    { id: "me", pz_id: "Sample-0000", display_name: "Sample Surname" },
    { id: "other", pz_id: "Other-1111", display_name: "Other Person" },
    { id: "rec", pz_id: "Recorded-2222", display_name: "Rec Student" },
    { id: "nobody", pz_id: "Nobody-3333", display_name: "No Enrol" },
  ],
  pz_id_aliases: [
    { alias_norm: "sample-0000", person_id: "me" },
    { alias_norm: "old-9999", person_id: "me" },
    { alias_norm: "nobody-3333", person_id: "nobody" },
  ],
  landing_pages: [
    { id: "pc", title: "Course A", slug: "course-a", status: "published", kind: "course", attendance_min_pct: 70, show_in_portal: true },
    { id: "pw", title: "Workshop B", slug: "workshop-b", status: "closed", kind: "workshop", attendance_min_pct: 75, show_in_portal: true },
    { id: "pd", title: "Draft C", slug: "draft-c", status: "draft", kind: "course", attendance_min_pct: 75, show_in_portal: true },
    { id: "pt", title: "Test Only D", slug: "test-d", status: "published", kind: "webinar", attendance_min_pct: 75, show_in_portal: true },
    { id: "ph", title: "Hidden E", slug: "hidden-e", status: "published", kind: "course", attendance_min_pct: 75, show_in_portal: false },
  ],
  landing_registrations: [
    { id: "r1", page_id: "pc", person_id: "me", status: "paid", is_test: false, option_label: "Live - Modules: M2", mode: "live", email: "me@example.com" },
    { id: "r2", page_id: "pc", person_id: "other", status: "paid", is_test: false, option_label: "Live - Full Course", mode: "live", email: "other@example.com" },
    { id: "r3", page_id: "pc", person_id: "rec", status: "free", is_test: false, option_label: "Recorded - Full Course", mode: "recorded", email: "rec@example.com" },
    { id: "r4", page_id: "pw", person_id: "me", status: "free", is_test: false, option_label: "Live - Full Course", mode: "live", email: "me@example.com" },
    { id: "r5", page_id: "pd", person_id: "me", status: "paid", is_test: false, option_label: "Live - Full Course", mode: "live", email: "me@example.com" },
    { id: "r6", page_id: "pt", person_id: "me", status: "paid", is_test: true, option_label: "Live - Full Course", mode: "live", email: "me@example.com" },
    { id: "r8h", page_id: "ph", person_id: "me", status: "paid", is_test: false, option_label: "Live - Full Course", mode: "live", email: "me@example.com" },
    { id: "r7", page_id: "pw", person_id: "nobody", status: "pending", is_test: false, option_label: "Live - Full Course", mode: "live", email: "n@example.com" },
  ],
  batch_sessions: [
    { id: "s1", page_id: "pc", number: 1, title: "Module 1 class", starts_at: PAST, audience: { mode: "live", modules: [1] }, quiz_max_score: 100 },
    { id: "s2", page_id: "pc", number: 2, title: "Module 2 class", starts_at: PAST2, audience: { mode: "live", modules: [2] }, quiz_max_score: 100 },
    { id: "s3", page_id: "pc", number: 3, title: "For everyone", starts_at: FUTURE, audience: null, quiz_max_score: null },
    { id: "w1", page_id: "pw", number: 1, title: "Workshop day", starts_at: PAST, audience: null, quiz_max_score: 10 },
  ],
  batch_session_marks: [
    { id: "m1", session_id: "s2", person_id: "me", source: "personal" },
    { id: "m2", session_id: "s1", person_id: "me", source: "admin" },
    { id: "m3", session_id: "s2", person_id: "other", source: "personal" },
  ],
  batch_quiz_results: [
    { id: "q1", session_id: "s2", person_id: "me", score: 80 },
    { id: "q2", session_id: "s2", person_id: "other", score: 90 },
    { id: "q3", session_id: "s2", person_id: "rec", score: 99 },
    { id: "q4", session_id: "s1", person_id: "other", score: 50 },
  ],
});

beforeEach(() => {
  db.reset();
  db.state.handler = memoryHandler(seed());
});

describe("getProgressByPzId", () => {
  it("returns null for malformed, empty and unknown IDs", async () => {
    for (const bad of ["", "   ", "nonsense", "Sample", "Sample-12", "ZZZ-9999", "%-1234", "a".repeat(200) + "-1234"]) {
      expect(await getProgressByPzId(bad, NOW)).toBeNull();
    }
  });

  it("returns null for a real person with no enrolment, and for a read error", async () => {
    expect(await getProgressByPzId("Nobody-3333", NOW)).toBeNull();
    const ok = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_pages" ? { data: null, error: { message: "boom" } } : ok(op));
    await expect(getProgressByPzId("Sample-0000", NOW)).rejects.toThrow();
  });

  it("builds one person's progress, matching the typed ID loosely and by alias", async () => {
    for (const typed of ["Sample-0000", "  sample - 0000 ", "OLD-9999"]) {
      const out = await getProgressByPzId(typed, NOW);
      expect(out?.firstName).toBe("Sample");
      expect(out?.pzId).toBe("Sample-0000");
    }
  });

  it("filters by module, counts started classes only, and shows visible non-test batches (a draft with the student included)", async () => {
    const out = (await getProgressByPzId("Sample-0000", NOW))!;
    expect(out.groups.map((g) => g.kind)).toEqual(["course", "workshop"]);
    const course = out.groups[0].batches.find((b) => b.slug === "course-a")!;
    expect(course.attendance!.rows.map((r) => [r.number, r.state, r.how])).toEqual([
      [2, "present", "check-in"],
      [3, "upcoming", null],
    ]);
    expect(course.attendance!.held).toBe(1);
    expect(course.attendance!.minPct).toBe(70);
    expect(out.groups[1].batches[0].attendance!.rows[0].state).toBe("absent");
    const slugs = out.groups.flatMap((g) => g.batches.map((b) => b.slug));
    expect(slugs).toContain("draft-c");
    expect(slugs).not.toContain("test-d");
    expect(slugs).not.toContain("hidden-e");
  });

  it("drops a batch whose portal switch is off, and shows it again when switched on", async () => {
    const off = (await getProgressByPzId("Sample-0000", NOW))!;
    expect(off.groups.flatMap((g) => g.batches.map((b) => b.slug))).not.toContain("hidden-e");
    const store = seed();
    store.landing_pages.find((p) => p.id === "ph")!.show_in_portal = true;
    db.state.handler = memoryHandler(store);
    const on = (await getProgressByPzId("Sample-0000", NOW))!;
    expect(on.groups.flatMap((g) => g.batches.map((b) => b.slug))).toContain("hidden-e");
  });

  it("ranks among live students with a saved score; recorded students are not ranked", async () => {
    const out = (await getProgressByPzId("Sample-0000", NOW))!;
    const row = out.groups[0].batches[0].results.rows[0];
    expect(row).toMatchObject({ number: 2, score: 80, max: 100, rank: 2, of: 2 });
    const r = (await getProgressByPzId("Recorded-2222", NOW))!;
    expect(r.groups[0].batches[0].attendance).toBeNull();
    expect(r.groups[0].batches[0].results.rows[0]).toMatchObject({ score: 99, rank: null, of: null });
  });

  it("never leaks a surname, an email or another person's ID", async () => {
    const text = JSON.stringify(await getProgressByPzId("Sample-0000", NOW));
    expect(text).not.toContain("Surname");
    expect(text).not.toContain("@");
    expect(text).not.toContain("Other");
    expect(text).not.toContain("Recorded-2222");
  });

  it("counts a class if ANY of several live registrations in one batch matches", async () => {
    const store = seed();
    store.landing_registrations.push({ id: "r8", page_id: "pc", person_id: "me", status: "paid", is_test: false, option_label: "Live - Modules: M1", mode: "live", email: "me@example.com" });
    store.landing_registrations.push({ id: "r9", page_id: "pc", person_id: "me", status: "paid", is_test: false, option_label: "Recorded - Full Course", mode: "recorded", email: "me@example.com" });
    db.state.handler = memoryHandler(store);
    const out = (await getProgressByPzId("Sample-0000", NOW))!;
    const course = out.groups[0].batches[0];
    expect(course.mode).toBe("live");
    expect(course.attendance!.rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("reads in chunks of 200 ids", async () => {
    const store = seed();
    for (let i = 0; i < 450; i++) {
      store.batch_sessions.push({ id: `x${i}`, page_id: "pc", number: 100 + i, title: `T${i}`, starts_at: PAST, audience: null, quiz_max_score: null });
    }
    db.state.handler = memoryHandler(store);
    const out = (await getProgressByPzId("Sample-0000", NOW))!;
    expect(out.groups[0].batches[0].attendance!.held).toBe(451);
    const marksReads = db.find("batch_session_marks", "select");
    expect(marksReads.length).toBe(3);
    for (const op of marksReads) {
      const ids = op.filters.find(([k, f]) => k === "in" && f === "session_id")![2] as string[];
      expect(ids.length).toBeLessThanOrEqual(200);
    }
  });
});
