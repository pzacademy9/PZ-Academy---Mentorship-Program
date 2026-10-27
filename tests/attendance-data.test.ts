// tests/attendance-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import {
  createSession, updateSession, deleteSession, getSessionByCode, eligiblePersonForEmail,
  markPresent, unmarkPresent, markAllPresent, isLiveEnrolled, personFirstName, getBatchGrid, setMinPct, listSessions,
} from "@/lib/data/attendance";

const NOW = new Date("2026-11-10T12:00:00Z");
const sess = (n: number, startsAt: string, over: Record<string, unknown> = {}) => ({
  id: `s${n}`, page_id: "pg1", number: n, title: `S${n}`, starts_at: startsAt, public_code: `code000${n}`, window_override: "auto", ...over,
});
const reg = (id: string, personId: string | null, over: Record<string, unknown> = {}) => ({
  id, page_id: "pg1", person_id: personId, mode: "live", status: "paid", is_test: false, ...over,
});

let store: Store;
/** Memory handler plus unique (session_id, person_id) on batch_session_marks and unique codes/numbers on batch_sessions. */
function handler(): (op: Op) => Res {
  const base = memoryHandler(store);
  return (op) => {
    if (op.table === "batch_session_marks" && (op.op === "upsert" || op.op === "insert")) {
      const items = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Record<string, unknown>[];
      const fresh = items.filter((p) => !(store.batch_session_marks ?? []).some((m) => m.session_id === p.session_id && m.person_id === p.person_id));
      const ignore = (op.upsertOptions as { ignoreDuplicates?: boolean } | undefined)?.ignoreDuplicates;
      if (op.op === "insert" && fresh.length < items.length) return { data: null, error: { code: "23505", message: "duplicate key" } };
      if (!ignore && op.op === "upsert") return base(op);
      return base({ ...op, payload: fresh });
    }
    if (op.table === "batch_sessions" && op.op === "insert") {
      const p = op.payload as Record<string, unknown>;
      const rows = store.batch_sessions ?? [];
      if (rows.some((r) => r.page_id === p.page_id && r.number === p.number)) {
        return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "batch_sessions_page_id_number_key"' } };
      }
      if (rows.some((r) => r.public_code === p.public_code)) {
        return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "batch_sessions_public_code_key"' } };
      }
    }
    return base(op);
  };
}
beforeEach(() => {
  db.reset();
  store = {
    landing_pages: [{ id: "pg1", title: "PPC Batch", attendance_min_pct: 75 }],
    pz_people: [
      { id: "p1", pz_id: "PZ-1", display_name: "Ayesha Khan" },
      { id: "p2", pz_id: "PZ-2", display_name: "Bilal Ahmed" },
      { id: "p3", pz_id: "PZ-3", display_name: "Rec Only" },
      { id: "p4", pz_id: "PZ-4", display_name: "Dina Z" },
      { id: "p5", pz_id: "PZ-5", display_name: "Eman Q" },
    ],
    pz_person_emails: [
      { email: "ayesha@x.com", person_id: "p1" },
      { email: "rec@x.com", person_id: "p3" },
      { email: "ghost@x.com", person_id: "p4" },
    ],
    landing_registrations: [
      reg("r1", "p1"), reg("r2", "p2", { status: "free" }), reg("r3", "p3", { mode: "recorded" }),
      reg("r4", "p4", { is_test: true }), reg("r5", "p5", { row_type: "member" }), reg("r6", null),
      reg("r7", "p1", { page_id: "other" }),
    ],
    batch_sessions: [], batch_session_marks: [],
  };
  db.state.handler = handler();
});

describe("markPresent", () => {
  it("is idempotent: created true then false", async () => {
    expect(await markPresent("s1", "p1", "personal")).toEqual({ created: true });
    expect(await markPresent("s1", "p1", "shared")).toEqual({ created: false });
    expect(store.batch_session_marks).toHaveLength(1);
    expect(store.batch_session_marks[0].source).toBe("personal");
  });
  it("passes markedBy", async () => {
    await markPresent("s1", "p1", "admin", "adm");
    expect(store.batch_session_marks[0].marked_by).toBe("adm");
  });
});

describe("unmarkPresent", () => {
  it("removes the mark", async () => {
    await markPresent("s1", "p1", "admin");
    await unmarkPresent("s1", "p1");
    expect(store.batch_session_marks).toHaveLength(0);
  });
});

describe("getBatchGrid", () => {
  beforeEach(() => {
    store.batch_sessions = [
      sess(1, "2026-11-01T10:00:00Z"), sess(2, "2026-11-03T10:00:00Z"), sess(3, "2026-11-05T10:00:00Z"), sess(4, "2026-12-01T10:00:00Z"),
    ];
    store.batch_session_marks = [
      { id: "m1", session_id: "s1", person_id: "p1", source: "admin" },
      { id: "m2", session_id: "s3", person_id: "p1", source: "admin" },
    ];
  });
  it("counts only started sessions in the denominator", async () => {
    const g = await getBatchGrid("pg1", NOW);
    expect(g.minPct).toBe(75);
    expect(g.sessions.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    const ayesha = g.rows.find((r) => r.personId === "p1")!;
    expect(ayesha).toMatchObject({ started: 3, marked: 2, pct: 67, meetsMin: false, pzId: "PZ-1", name: "Ayesha Khan" });
    expect(ayesha.marks).toEqual({ s1: true, s3: true });
  });
  it("excludes recorded-only, test and personless registrations; includes members; sorts by name", async () => {
    const g = await getBatchGrid("pg1", NOW);
    expect(g.rows.map((r) => r.name)).toEqual(["Ayesha Khan", "Bilal Ahmed", "Eman Q"]);
    expect(g.rows.find((r) => r.personId === "p2")).toMatchObject({ marked: 0, pct: 0 });
  });
  it("pct is null when nothing has started", async () => {
    const g = await getBatchGrid("pg1", new Date("2026-10-01T00:00:00Z"));
    expect(g.rows[0]).toMatchObject({ started: 0, pct: null, meetsMin: false });
  });
});

describe("eligiblePersonForEmail", () => {
  it("returns person and first name for a live enrolled email, trimmed and lowercased", async () => {
    const r = await eligiblePersonForEmail("pg1", "  Ayesha@X.com ");
    expect(r).toEqual({ personId: "p1", firstName: "Ayesha" });
    expect(JSON.stringify(r)).not.toContain("@");
  });
  it("not_live for recorded only", async () => {
    expect(await eligiblePersonForEmail("pg1", "rec@x.com")).toEqual({ reason: "not_live" });
  });
  it("no_person for unknown email", async () => {
    expect(await eligiblePersonForEmail("pg1", "nobody@x.com")).toEqual({ reason: "no_person" });
  });
  it("not_in_batch when person has no enrolled registration here", async () => {
    expect(await eligiblePersonForEmail("pg1", "ghost@x.com")).toEqual({ reason: "not_in_batch" });
  });
});

describe("isLiveEnrolled", () => {
  it("true for live, false for recorded-only and others", async () => {
    expect(await isLiveEnrolled("pg1", "p1")).toBe(true);
    expect(await isLiveEnrolled("pg1", "p3")).toBe(false);
    expect(await isLiveEnrolled("pg1", "p4")).toBe(false);
  });
});

describe("personFirstName", () => {
  it("returns the first name, or null when the person no longer exists", async () => {
    expect(await personFirstName("p1")).toBe("Ayesha");
    expect(await personFirstName("gone")).toBeNull();
  });
});

describe("markAllPresent", () => {
  it("adds only missing live people, then is a no-op", async () => {
    // 5 live people: p1, p2, p5 plus two more
    store.batch_sessions = [sess(1, "2026-11-01T10:00:00Z")];
    store.pz_people.push({ id: "p6", pz_id: "PZ-6", display_name: "F" }, { id: "p7", pz_id: "PZ-7", display_name: "G" });
    store.landing_registrations.push(reg("r8", "p6"), reg("r9", "p7"));
    store.batch_session_marks = [
      { id: "m1", session_id: "s1", person_id: "p1", source: "personal" },
      { id: "m2", session_id: "s1", person_id: "p2", source: "personal" },
    ];
    expect(await markAllPresent("s1", "adm")).toEqual({ added: 3 });
    expect(store.batch_session_marks).toHaveLength(5);
    expect(store.batch_session_marks.filter((m) => m.source === "admin" && m.marked_by === "adm")).toHaveLength(3);
    expect(await markAllPresent("s1", "adm")).toEqual({ added: 0 });
  });
});

describe("setMinPct", () => {
  it("rejects out of range and non-integers without writing", async () => {
    expect(await setMinPct("pg1", 101)).toEqual({ ok: false });
    expect(await setMinPct("pg1", -1)).toEqual({ ok: false });
    expect(await setMinPct("pg1", 50.5)).toEqual({ ok: false });
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("writes a valid value", async () => {
    expect(await setMinPct("pg1", 80)).toEqual({ ok: true });
    expect(store.landing_pages[0].attendance_min_pct).toBe(80);
  });
});

describe("sessions CRUD", () => {
  const input = { number: 1, title: "Intro", startsAt: "2026-11-01T10:00:00Z", zoomUrl: "z", kahootUrl: "", includeKahoot: false, includeAttendanceLink: true, emailEnabled: true, emailLeadMinutes: 60 };
  it("creates with a generated code and maps fields", async () => {
    const r = await createSession("pg1", input);
    expect(r.ok).toBe(true);
    expect(store.batch_sessions[0]).toMatchObject({ page_id: "pg1", number: 1, starts_at: input.startsAt, zoom_url: "z", email_lead_minutes: 60 });
    expect(String(store.batch_sessions[0].public_code)).toMatch(/^[a-z0-9]{8}$/);
  });
  it("duplicate number gives a clear message", async () => {
    await createSession("pg1", input);
    expect(await createSession("pg1", input)).toEqual({ ok: false, message: "Session number already used" });
  });
  it("retries once on a public_code collision", async () => {
    let first = true;
    const inner = handler();
    db.state.handler = (op) => {
      if (op.table === "batch_sessions" && op.op === "insert" && first) {
        first = false;
        return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "batch_sessions_public_code_key"' } };
      }
      return inner(op);
    };
    expect((await createSession("pg1", input)).ok).toBe(true);
    expect(db.find("batch_sessions", "insert")).toHaveLength(2);
  });
  it("updateSession moves a session already in the past and sets the override", async () => {
    store.batch_sessions = [sess(1, "2020-01-01T10:00:00Z")];
    const r = await updateSession("s1", { startsAt: "2026-12-01T10:00:00Z", windowOverride: "open" });
    expect(r.ok).toBe(true);
    expect(store.batch_sessions[0]).toMatchObject({ starts_at: "2026-12-01T10:00:00Z", window_override: "open" });
  });
  it("updateSession duplicate number gives a message", async () => {
    store.batch_sessions = [sess(1, "2026-11-01T10:00:00Z")];
    db.state.handler = (op) => op.table === "batch_sessions" && op.op === "update"
      ? { data: null, error: { code: "23505", message: "duplicate key" } }
      : handler()(op);
    expect(await updateSession("s1", { number: 2 })).toEqual({ ok: false, message: "Session number already used" });
  });
  it("lists by number, finds by code with batch title, deletes", async () => {
    store.batch_sessions = [sess(2, "2026-11-03T10:00:00Z"), sess(1, "2026-11-01T10:00:00Z")];
    expect((await listSessions("pg1")).map((s) => s.number)).toEqual([1, 2]);
    expect(await getSessionByCode("code0001")).toMatchObject({ id: "s1", batchTitle: "PPC Batch" });
    expect(await getSessionByCode("nope")).toBeNull();
    await deleteSession("s1");
    expect(store.batch_sessions).toHaveLength(1);
  });
});
