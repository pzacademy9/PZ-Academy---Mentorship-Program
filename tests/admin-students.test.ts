import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, boolean>,
  calls: [] as { table: string; op: string; col: string; val: unknown }[],
  emails: {} as Record<string, string>,
  certs: [] as unknown[],
  certError: false,
}));

function chain(table: string) {
  const f: { col: string; val: unknown; op: string }[] = [];
  let range: [number, number] = [0, 999];
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.order = () => c;
  c.eq = (col: string, val: unknown) => {
    f.push({ col, val, op: "eq" });
    h.calls.push({ table, op: "eq", col, val });
    return c;
  };
  c.in = (col: string, val: unknown) => {
    f.push({ col, val, op: "in" });
    h.calls.push({ table, op: "in", col, val });
    return c;
  };
  c.range = (a: number, b: number) => {
    range = [a, b];
    return c;
  };
  c.then = (res: (v: unknown) => unknown) => {
    if (h.errors[table]) return res({ data: null, error: { message: "x" } });
    const rows = (h.tables[table] ?? []).filter((r: Row) =>
      f.every((x) => (x.op === "eq" ? r[x.col] === x.val : (x.val as unknown[]).includes(r[x.col]))),
    );
    return res({ data: rows.slice(range[0], range[1] + 1), error: null });
  };
  return c;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ from: (t: string) => chain(t) }),
}));
vi.mock("@/lib/data/admin-enrollments", () => ({
  resolveEmails: async (ids: string[]) => {
    const m = new Map<string, string>();
    for (const id of ids) if (h.emails[id]) m.set(id, h.emails[id]);
    return m;
  },
}));
vi.mock("@/lib/certs/cert-source", async () => {
  class CertSourceError extends Error {}
  return {
    CertSourceError,
    getAllCerts: async () => {
      if (h.certError) throw new CertSourceError("down");
      return h.certs;
    },
  };
});

import { listStudents, getStudentRecord } from "@/lib/data/admin-students";

function profile(id: string, name: string, role = "student", created = "2026-01-01T00:00:00Z", phone: string | null = null) {
  return { id, full_name: name, phone, role, created_at: created, city: null, profession: null };
}
function enr(id: string, student: string, course: string, status = "active") {
  return { id, student_id: student, course_id: course, status, enrolled_at: "2026-02-01T00:00:00Z" };
}
function cert(id: string, email: string, status = "generated", category = "General") {
  return { id, certId: id, name: "S", email, category, subCategory: "Courses", topic: "Pharma", batchId: "b", batchName: "B", issueDate: "2026-10-01", status, viewUrl: "" };
}

beforeEach(() => {
  h.errors = {};
  h.calls = [];
  h.certError = false;
  h.certs = [];
  h.emails = { a: "ayesha@x.com", b: "bilal@x.com", m: "mentor@x.com", p: "plain@x.com" };
  h.tables = {
    profiles: [
      profile("a", "Ayesha Khan", "student", "2026-03-01T00:00:00Z", "0300111"),
      profile("b", "Bilal Raza", "student", "2026-02-01T00:00:00Z"),
      profile("m", "Mentor Enrolled", "mentor", "2026-01-15T00:00:00Z"),
      profile("p", "Plain Mentor", "mentor", "2026-01-10T00:00:00Z"),
    ],
    courses: [{ id: "c1", title: "Course One" }, { id: "c2", title: "Course Two" }],
    enrollments: [enr("e1", "a", "c1"), enr("e2", "b", "c1", "pending"), enr("e3", "m", "c2")],
    modules: [{ id: "m1", course_id: "c1" }, { id: "m2", course_id: "c2" }],
    lessons: [{ id: "l1", module_id: "m1" }, { id: "l2", module_id: "m1" }, { id: "l3", module_id: "m2" }],
    lesson_progress: [
      { id: "p1", student_id: "a", lesson_id: "l1", status: "completed" },
      { id: "p2", student_id: "a", lesson_id: "l2", status: "completed" },
    ],
    attendance: [
      { id: "t1", student_id: "a", course_id: "c1", session_date: "2026-04-01", marked_at: "2026-04-01T10:00:00Z" },
      { id: "t2", student_id: "b", course_id: "c1", session_date: "2026-04-01", marked_at: "2026-04-01T10:00:00Z" },
      { id: "t3", student_id: "b", course_id: "c1", session_date: "2026-04-08", marked_at: "2026-04-08T10:00:00Z" },
    ],
    feedback_responses: [
      { id: "f1", participant_profile_id: "a", participant_email: null, submitted_at: "2026-05-01T00:00:00Z", comments: "Great" },
    ],
    feedback_answers: [
      { id: "fa1", response_id: "f1", question_id: "q", star_value: 4 },
      { id: "fa2", response_id: "f1", question_id: "q2", star_value: 5 },
    ],
    mentorship_bookings: [
      { id: "mb1", student_id: "a", mentor_name: "Dr M", package_name: "Pack", status: "confirmed", sessions_total: 4, created_at: "2026-06-01T00:00:00Z" },
    ],
  };
});

describe("listStudents", () => {
  it("includes enrolled mentor but not a plain mentor", async () => {
    const r = await listStudents({});
    expect(r.rows.map((x) => x.id).sort()).toEqual(["a", "b", "m"]);
    expect(r.total).toBe(3);
    expect(r.rows[0].id).toBe("a"); // newest first
  });

  it("searches by email, case-insensitive", async () => {
    const r = await listStudents({ search: "BILAL@X" });
    expect(r.rows.map((x) => x.id)).toEqual(["b"]);
    const r2 = await listStudents({ search: "(" });
    expect(r2.rows).toEqual([]);
  });

  it("filters payment-pending", async () => {
    const r = await listStudents({ filter: "payment-pending" });
    expect(r.rows.map((x) => x.id)).toEqual(["b"]);
  });

  it("filters finished and active", async () => {
    expect((await listStudents({ filter: "finished" })).rows.map((x) => x.id)).toEqual(["a"]);
    expect((await listStudents({ filter: "active" })).rows.map((x) => x.id).sort()).toEqual(["a", "m"]);
  });

  it("computes progress, attended and certificate chip", async () => {
    h.certs = [];
    const a = (await listStudents({})).rows.find((x) => x.id === "a")!;
    expect(a.progress).toBe(100);
    expect(a.attended).toBe("1 of 2");
    expect(a.certificate).toBe("pending");
    h.certs = [cert("k1", " Ayesha@X.com ")];
    const a2 = (await listStudents({})).rows.find((x) => x.id === "a")!;
    expect(a2.certificate).toBe("issued");
    const b = (await listStudents({})).rows.find((x) => x.id === "b")!;
    expect(b.certificate).toBe("none");
  });

  it("clamps the page", async () => {
    const r = await listStudents({ page: 99 });
    expect(r.page).toBe(1);
    expect(r.pageCount).toBe(1);
    const r2 = await listStudents({ page: -4 });
    expect(r2.page).toBe(1);
  });

  it("pages past 1000 rows without truncating", async () => {
    h.tables.profiles = Array.from({ length: 1100 }, (_, i) =>
      profile(`s${i}`, `Student ${i}`, "student", `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`),
    );
    h.tables.enrollments = [];
    const r = await listStudents({});
    expect(r.total).toBe(1100);
    expect(r.pageCount).toBe(44);
    expect(r.rows).toHaveLength(25);
  });

  it("marks certificate unknown for all rows when the cert source throws", async () => {
    h.certError = true;
    const r = await listStudents({});
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.certificate === "unknown")).toBe(true);
  });

  it("throws a plain error when a query fails", async () => {
    h.errors.enrollments = true;
    await expect(listStudents({})).rejects.toThrow(/could not load/i);
  });
});

describe("getStudentRecord", () => {
  it("returns null for a non-student without enrollments", async () => {
    expect(await getStudentRecord("p")).toBeNull();
    expect(await getStudentRecord("nobody")).toBeNull();
  });

  it("builds the full record", async () => {
    h.certs = [cert("k1", "ayesha@x.com"), cert("k2", "ayesha@x.com", "revoked"), cert("k3", "bilal@x.com")];
    const r = (await getStudentRecord("a"))!;
    expect(r.profile.email).toBe("ayesha@x.com");
    expect(r.tiles).toEqual({ courses: 1, progress: 100, attended: "1 of 2", averageFeedback: 4.5, certificate: "issued" });
    expect(r.enrollments).toHaveLength(1);
    expect(r.progressByCourse[0]).toMatchObject({ courseTitle: "Course One", totalLessons: 2, completedLessons: 2, percent: 100 });
    expect(r.attendance).toHaveLength(1);
    expect(r.feedback).toHaveLength(1);
    expect(r.mentorship).toHaveLength(1);
    expect(r.certs).toMatchObject({ state: "ok", pendingCount: 0 });
    if (r.certs.state === "ok") expect(r.certs.certs).toHaveLength(2);
    expect(r.recentActivity.length).toBeGreaterThan(0);
    expect(r.recentActivity.length).toBeLessThanOrEqual(8);
  });

  it("falls back to participant email for feedback", async () => {
    h.tables.feedback_responses = [
      { id: "f9", participant_profile_id: null, participant_email: "ayesha@x.com", submitted_at: "2026-05-02T00:00:00Z", comments: "" },
    ];
    h.tables.feedback_answers = [{ id: "z", response_id: "f9", question_id: "q", star_value: 3 }];
    const r = (await getStudentRecord("a"))!;
    expect(r.feedback).toHaveLength(1);
    expect(r.tiles.averageFeedback).toBe(3);
  });

  it("reports certs unavailable while the rest is populated", async () => {
    h.certError = true;
    const r = (await getStudentRecord("a"))!;
    expect(r.certs).toEqual({ state: "unavailable" });
    expect(r.tiles.certificate).toBe("unknown");
    expect(r.enrollments).toHaveLength(1);
    expect(r.attention.find((x) => x.key === "certs-pending")).toBeUndefined();
  });

  it("throws a plain error when a query fails", async () => {
    h.errors.attendance = true;
    await expect(getStudentRecord("a")).rejects.toThrow(/could not load/i);
  });
});
