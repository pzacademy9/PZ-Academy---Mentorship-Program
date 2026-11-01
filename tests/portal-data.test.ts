// tests/portal-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { listPortalBatches, getPortalBatch, getProgressForUser } from "@/lib/data/portal";

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
    { id: "pc", title: "Course A", slug: "course-a", status: "published", kind: "course", attendance_min_pct: 70, show_in_portal: true },
    { id: "pd", title: "Draft C", slug: "draft-c", status: "draft", kind: "course", attendance_min_pct: 75, show_in_portal: true },
    { id: "pk", title: "Other Kind", slug: "other-kind", status: "published", kind: "page", attendance_min_pct: 75, show_in_portal: true },
    { id: "pe", title: "Empty Draft", slug: "empty-draft", status: "draft", kind: "course", attendance_min_pct: 75, show_in_portal: true },
    { id: "ph", title: "Hidden By Switch", slug: "hidden", status: "published", kind: "course", attendance_min_pct: 75, show_in_portal: false },
    { id: "pq", title: "Hidden Draft", slug: "hidden-draft", status: "draft", kind: "course", attendance_min_pct: 75, show_in_portal: false },
    { id: "pn", title: "Auto Draft", slug: "auto-draft", status: "draft", kind: "course", attendance_min_pct: 75, show_in_portal: null },
    { id: "pa", title: "Auto Published", slug: "auto-published", status: "published", kind: "course", attendance_min_pct: 75, show_in_portal: null },
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
    reg("r9", "ph", "me"),
    reg("r10", "pq", "me"),
    reg("r11", "pn", "me"),
    reg("r12", "pa", "me"),
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
  courses: [{ id: "crs1", title: "Sample Programme" }],
});

beforeEach(() => {
  db.reset();
  db.state.handler = memoryHandler(seed());
});

describe("listPortalBatches", () => {
  it("shows a draft that has students, hides empty drafts, wrong kinds and switched-off batches", async () => {
    const cards = await listPortalBatches(NOW);
    expect(cards.map((c) => c.slug).sort()).toEqual(["auto-published", "course-a", "draft-c"]);
    const draft = cards.find((c) => c.slug === "draft-c")!;
    expect(draft).toMatchObject({ students: 1, state: "completed" });
  });

  it("carries the course id and title, or null when the batch has no course", async () => {
    const s = seed();
    Object.assign(s.landing_pages[0], { course_id: "crs1" });
    db.state.handler = memoryHandler(s);
    const cards = await listPortalBatches(NOW);
    expect(cards.find((c) => c.slug === "course-a")).toMatchObject({ courseId: "crs1", courseTitle: "Sample Programme" });
    expect(cards.find((c) => c.slug === "draft-c")).toMatchObject({ courseId: null, courseTitle: null });
    expect(db.find("courses", "select")).toHaveLength(1);
  });

  it("counts enrolled people and classes", async () => {
    const cards = (await listPortalBatches(NOW)).filter((c) => c.slug === "course-a");
    expect(cards[0]).toMatchObject({ students: 3, classesHeld: 2, classesTotal: 3, lastClassAt: FUTURE, state: "live" });
  });

  describe("coverUrl", () => {
    const cover = async (published: unknown, classCover: string | null = null) => {
      const s = seed();
      Object.assign(s.landing_pages[0], { published, class_cover_url: classCover });
      db.state.handler = memoryHandler(s);
      return (await listPortalBatches(NOW)).find((c) => c.slug === "course-a")!.coverUrl;
    };
    const content = (hero: Record<string, unknown>, ogImage = "") => ({
      seo: { title: "", description: "", ogImage },
      sections: [{ id: "h1", type: "hero", enabled: true, data: hero }],
    });

    it("prefers hero computer picture, then phone, then og image, then class cover", async () => {
      expect(await cover(content({ imagePc: "https://x.test/pc.jpg", imagePhone: "https://x.test/ph.jpg" }, "https://x.test/og.jpg"), "https://x.test/cc.jpg")).toBe("https://x.test/pc.jpg");
      expect(await cover(content({ imagePhone: "https://x.test/ph.jpg" }, "https://x.test/og.jpg"), "https://x.test/cc.jpg")).toBe("https://x.test/ph.jpg");
      expect(await cover(content({}, "https://x.test/og.jpg"), "https://x.test/cc.jpg")).toBe("https://x.test/og.jpg");
      expect(await cover(content({}), "https://x.test/cc.jpg")).toBe("https://x.test/cc.jpg");
    });

    it("skips unsafe urls and falls through", async () => {
      expect(await cover(content({ imagePc: "javascript:alert(1)", imagePhone: "/relative.jpg" }, "https://x.test/og.jpg"))).toBe("https://x.test/og.jpg");
      expect(await cover(null, "data:text/html,x")).toBeNull();
    });

    it("is null when nothing is set", async () => {
      expect(await cover(null)).toBeNull();
      expect(await cover(content({}))).toBeNull();
    });
  });

  it("marks a closed batch completed", async () => {
    const s = seed();
    s.landing_pages[0].status = "closed";
    db.state.handler = memoryHandler(s);
    expect((await listPortalBatches(NOW)).find((c) => c.slug === "course-a")!.state).toBe("completed");
  });

  it("rejects when a read fails", async () => {
    const ok = db.state.handler;
    db.state.handler = (op) => (op.table === "batch_sessions" ? { data: null, error: { message: "boom" } } : ok(op));
    await expect(listPortalBatches(NOW)).rejects.toThrow();
  });
});

describe("getPortalBatch", () => {
  it("passes how each mark was made (admin vs check-in)", async () => {
    const view = (await getPortalBatch("course-a", NOW))!;
    const me = view.attendance.find((r) => r.pzId === "Sample-0000")!;
    expect(me.classes.find((c) => c.number === 1)?.how).toBe("check-in");
    const other = view.attendance.find((r) => r.pzId === "Name-0001")!;
    expect(other.classes.find((c) => c.number === 2)?.how).toBe("admin");
  });

  it("returns exactly the enrolled people with full names and no emails", async () => {
    const view = (await getPortalBatch("course-a", NOW))!;
    expect(view.attendance.map((r) => r.pzId).sort()).toEqual(["Name-0001", "Name-0002", "Sample-0000"]);
    expect(view.attendance.map((r) => r.name).sort()).toEqual(["Other Person", "Rec Student", "Sample Surname"]);
    expect(view.sessions.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(view.overall.map((r) => r.pzId)).toEqual(["Name-0001", "Sample-0000", "Name-0002"]);
    const text = JSON.stringify(view);
    expect(text).not.toContain("@");
    expect(text).toContain("Sample Surname");
    expect(text).not.toMatch(/email|phone|whatsapp/i);
    for (const gone of ["Name-0003", "Name-0004", "Name-0005", "Name-0006"]) expect(text).not.toContain(gone);
  });

  it("leaves out a class whose stored audience cannot be read", async () => {
    const view = (await getPortalBatch("course-a", NOW))!;
    expect(view.sessions.map((s) => s.id)).not.toContain("sx");
  });

  it("returns null for unknown, empty-draft, wrong-kind and switched-off slugs", async () => {
    for (const slug of ["nope", "empty-draft", "other-kind", "hidden", "hidden-draft", "auto-draft"]) expect(await getPortalBatch(slug, NOW)).toBeNull();
  });

  it("an automatic draft stays private even with students; an automatic published batch is open", async () => {
    expect(await getPortalBatch("auto-draft", NOW)).toBeNull();
    expect(await getPortalBatch("auto-published", NOW)).not.toBeNull();
  });

  it("opens a draft batch that is switched on and has students", async () => {
    const view = (await getPortalBatch("draft-c", NOW))!;
    expect(view.attendance.map((r) => r.pzId)).toEqual(["Sample-0000"]);
  });

  it("opens a hidden batch again when the switch is turned on", async () => {
    const s = seed();
    s.landing_pages.find((p) => p.id === "ph")!.show_in_portal = true;
    db.state.handler = memoryHandler(s);
    expect(await getPortalBatch("hidden", NOW)).not.toBeNull();
  });

  it("rejects when a read fails", async () => {
    const ok = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_registrations" ? { data: null, error: { message: "boom" } } : ok(op));
    await expect(getPortalBatch("course-a", NOW)).rejects.toThrow();
  });
});

describe("getProgressForUser", () => {
  it("is unconfirmed without a confirmed email and loads nothing", async () => {
    const calls = vi.fn();
    const ok = db.state.handler;
    db.state.handler = (op) => (calls(), ok(op));
    expect(await getProgressForUser({ email: "me@example.com", email_confirmed_at: null }, NOW)).toEqual({ status: "unconfirmed" });
    expect(await getProgressForUser({ email: null, email_confirmed_at: "2026-10-01T00:00:00Z" }, NOW)).toEqual({ status: "unconfirmed" });
    expect(await getProgressForUser({}, NOW)).toEqual({ status: "unconfirmed" });
    expect(calls).not.toHaveBeenCalled();
  });
  it("returns the progress for a confirmed email, matched case-insensitively", async () => {
    const out = await getProgressForUser({ email: "  Me@Example.com ", email_confirmed_at: "2026-10-01T00:00:00Z" }, NOW);
    expect(out.status).toBe("ok");
    expect(out.status === "ok" && out.progress?.pzId).toBe("Sample-0000");
    expect(out.status === "ok" && out.progress?.firstName).toBe("Sample");
  });
  it("is ok with null progress for an unknown confirmed email", async () => {
    expect(await getProgressForUser({ email: "nobody@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" }, NOW)).toEqual({ status: "ok", progress: null });
  });
});
