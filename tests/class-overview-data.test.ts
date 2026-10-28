// tests/class-overview-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getClassOverview } from "@/lib/data/class-overview";

// 2026-11-10 12:00 PKT-ish: 07:00Z is 12:00 PKT.
const NOW = new Date("2026-11-10T07:00:00Z");
const cls = (n: number, startsAt: string, over: Record<string, unknown> = {}) => ({
  id: `s${n}`, page_id: "pg1", number: n, title: `Day ${n}`, speaker: "Dr A", starts_at: startsAt, ends_at: null,
  public_code: `code000${n}`, quiz_saved_at: null, feedback_session_id: null, ...over,
});

let store: Store;
beforeEach(() => {
  db.reset();
  store = {
    landing_pages: [{ id: "pg1", title: "PPC Batch", attendance_min_pct: 75 }],
    landing_registrations: [
      { id: "r1", page_id: "pg1", person_id: "p1", mode: "live", status: "paid", is_test: false },
      { id: "r2", page_id: "pg1", person_id: "p2", mode: "live", status: "free", is_test: false },
      { id: "r3", page_id: "pg1", person_id: "p3", mode: "recorded", status: "paid", is_test: false },
    ],
    batch_sessions: [
      cls(1, "2026-11-09T14:00:00Z", { feedback_session_id: "f1", quiz_saved_at: "2026-11-09T17:00:00Z" }),
      cls(2, "2026-11-10T14:00:00Z", { feedback_session_id: "f2" }),
      cls(3, "2026-11-11T14:00:00Z"),
    ],
    batch_session_marks: [
      { id: "m1", session_id: "s1", person_id: "p1" },
      { id: "m2", session_id: "s1", person_id: "p2" },
      { id: "m3", session_id: "s2", person_id: "p1" },
      { id: "m4", session_id: "s1", person_id: "p3" },
    ],
    batch_quiz_results: [
      { id: "q1", session_id: "s1", person_id: "p1" },
      { id: "q2", session_id: "s1", person_id: "p2" },
    ],
    feedback_sessions: [{ id: "f1", slug: "slug-one" }, { id: "f2", slug: "slug-two" }],
  };
  db.state.handler = memoryHandler(store, (fn) =>
    fn === "feedback_session_stats"
      ? { data: [{ feedback_session_id: "f1", response_count: 12, avg_star: "4.5" }], error: null }
      : { data: null, error: { message: "no rpc" } },
  );
});

describe("getClassOverview", () => {
  it("status is today/upcoming/done by PKT date", async () => {
    const o = await getClassOverview("pg1", NOW);
    expect(o.classes.map((c) => c.status)).toEqual(["done", "today", "upcoming"]);
    // 20:00 PKT on 9 Nov is 15:00Z; a class at 23:30Z on the 9th is already the 10th in PKT.
    store.batch_sessions[0].starts_at = "2026-11-09T23:30:00Z";
    expect((await getClassOverview("pg1", NOW)).classes[0].status).toBe("today");
  });

  it("selectedId prefers today then next upcoming then last", async () => {
    expect((await getClassOverview("pg1", NOW)).selectedId).toBe("s2");
    // Between classes: day 1 done, nothing today -> next upcoming.
    store.batch_sessions[1].starts_at = "2026-11-12T14:00:00Z";
    expect((await getClassOverview("pg1", NOW)).selectedId).toBe("s3");
    // All done -> last.
    expect((await getClassOverview("pg1", new Date("2026-12-01T00:00:00Z"))).selectedId).toBe("s2");
  });

  it("counts come from one query per kind", async () => {
    const o = await getClassOverview("pg1", NOW);
    expect(db.find("batch_session_marks", "select")).toHaveLength(1);
    expect(db.find("batch_quiz_results", "select")).toHaveLength(1);
    expect(db.state.ops.filter((x) => x.op === "rpc")).toHaveLength(1);
    const [c1, c2, c3] = o.classes;
    expect(c1.presentCount).toBe(2); // recorded student p3 is not counted
    expect(c2.presentCount).toBe(1);
    expect(c1.enrolledLive).toBe(2);
    expect(c1.quiz).toEqual({ saved: true, players: 2, needCheck: 0 });
    expect(c2.quiz).toEqual({ saved: false, players: 0, needCheck: 0 });
    expect(c1.feedbackCount).toBe(12);
    expect(c1.feedbackAvg).toBe(4.5);
    expect(c2.feedbackCount).toBe(0);
    expect(c2.feedbackAvg).toBeNull();
    expect(c1.feedbackLink).toMatch(/\/feedback\/slug-one$/);
    expect(c3.feedbackLink).toBeNull();
    expect(c1.attendanceLink).toMatch(/\/attend\/code0001$/);
    expect(o.title).toBe("PPC Batch");
  });

  it("empty batch gives no classes and an empty selection", async () => {
    store.batch_sessions.length = 0;
    const o = await getClassOverview("pg1", NOW);
    expect(o.classes).toEqual([]);
    expect(o.selectedId).toBe("");
  });
});
