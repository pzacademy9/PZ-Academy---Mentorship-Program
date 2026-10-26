import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  adminTables: null as Record<string, Record<string, unknown>[]> | null,
  adminCalls: [] as string[],
  user: null as { id: string; email: string | null; email_confirmed_at: string | null } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, boolean>,
  calls: [] as { table: string; op: string; col: string; val: unknown }[],
  certs: [] as unknown[],
  certError: false,
  certCalls: 0,
}));

function chain(table: string, source: "user" | "admin" = "user") {
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
    if (source === "admin") h.adminCalls.push(table);
    const store = source === "admin" && h.adminTables ? h.adminTables : h.tables;
    if (h.errors[table]) return res({ data: null, error: { message: "x" } });
    const rows = (store[table] ?? []).filter((r: Row) =>
      f.every((x) => (x.op === "eq" ? r[x.col] === x.val : (x.val as unknown[]).includes(r[x.col]))),
    );
    return res({ data: rows.slice(range[0], range[1] + 1), error: null });
  };
  return c;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (t: string) => chain(t),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ from: (t: string) => chain(t, "admin") }),
}));
vi.mock("@/lib/certs/cert-source", async () => {
  class CertSourceError extends Error {}
  return {
    CertSourceError,
    getCertsByEmail: async () => {
      h.certCalls++;
      if (h.certError) throw new CertSourceError("down");
      return h.certs;
    },
  };
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { getMyCertificates } from "@/lib/data/student-certificates";

function cert(id: string, status: string, category = "General") {
  return { id, certId: id, name: "S", email: "stu@example.com", category, subCategory: "Courses", topic: "T", batchId: "b", batchName: "B", issueDate: "2026-10-01", status, viewUrl: "" };
}

beforeEach(() => {
  h.user = { id: "stu-1", email: "Stu@Example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
  h.errors = {};
  h.calls = [];
  h.adminTables = null;
  h.adminCalls = [];
  h.certCalls = 0;
  h.certError = false;
  h.certs = [];
  h.tables = {
    enrollments: [
      { id: "e1", course_id: "c1", student_id: "stu-1", status: "active" },
      { id: "e2", course_id: "c2", student_id: "stu-1", status: "active" },
      { id: "e3", course_id: "c3", student_id: "stu-1", status: "pending" },
      { id: "e4", course_id: "c4", student_id: "other", status: "active" },
    ],
    modules: [
      { id: "m1", course_id: "c1" },
      { id: "m2", course_id: "c2" },
      { id: "m3", course_id: "c3" },
      { id: "m4", course_id: "c4" },
    ],
    lessons: [
      { id: "l1", module_id: "m1" },
      { id: "l2", module_id: "m2" },
      { id: "l3", module_id: "m3" },
      { id: "l4", module_id: "m4" },
    ],
    lesson_progress: [
      { id: "p1", lesson_id: "l1", student_id: "stu-1", status: "completed" },
      { id: "p2", lesson_id: "l2", student_id: "stu-1", status: "completed" },
      { id: "p3", lesson_id: "l3", student_id: "stu-1", status: "completed" },
      { id: "p4", lesson_id: "l4", student_id: "other", status: "completed" },
    ],
  };
});

describe("getMyCertificates", () => {
  it("returns only generated/sent certs", async () => {
    h.certs = [cert("a", "generated"), cert("b", "sent"), cert("c", "revoked"), cert("d", "pending")];
    const r = await getMyCertificates();
    expect(r.state).toBe("ok");
    if (r.state === "ok") expect(r.issued.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("2 finished courses + 1 issued General gives pendingCount 1", async () => {
    h.certs = [cert("a", "generated")];
    expect(await getMyCertificates()).toMatchObject({ state: "ok", pendingCount: 1 });
  });

  it("Official certs do not affect pendingCount", async () => {
    h.certs = [cert("o", "sent", "Official")];
    const r = await getMyCertificates();
    expect(r).toMatchObject({ state: "ok", pendingCount: 2 });
    if (r.state === "ok") expect(r.issued).toHaveLength(1);
  });

  it("pendingCount never negative", async () => {
    h.certs = [cert("a", "sent"), cert("b", "sent"), cert("c", "sent")];
    expect(await getMyCertificates()).toMatchObject({ pendingCount: 0 });
  });

  it("CertSourceError gives unavailable", async () => {
    h.certError = true;
    expect(await getMyCertificates()).toEqual({ state: "unavailable" });
  });

  it("no user redirects to /login", async () => {
    h.user = null;
    await expect(getMyCertificates()).rejects.toThrow("REDIRECT:/login");
  });

  it("unconfirmed email => unverified, nothing else touched", async () => {
    h.user = { id: "stu-1", email: "a@b.com", email_confirmed_at: null };
    expect(await getMyCertificates()).toEqual({ state: "unverified" });
    expect(h.certCalls).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("null email => unverified", async () => {
    h.user = { id: "stu-1", email: null, email_confirmed_at: "2026-01-01T00:00:00Z" };
    expect(await getMyCertificates()).toEqual({ state: "unverified" });
    expect(h.certCalls).toBe(0);
  });

  it("scopes by student and status; non-active enrollment and other students excluded", async () => {
    const r = await getMyCertificates();
    expect(r).toMatchObject({ state: "ok", pendingCount: 2 });
    expect(h.calls).toContainEqual({ table: "enrollments", op: "eq", col: "student_id", val: "stu-1" });
    expect(h.calls).toContainEqual({ table: "enrollments", op: "eq", col: "status", val: "active" });
    expect(h.calls).toContainEqual({ table: "lesson_progress", op: "eq", col: "student_id", val: "stu-1" });
    expect(h.calls).toContainEqual({ table: "lesson_progress", op: "eq", col: "status", val: "completed" });
    expect(h.calls.some((c) => c.table === "lesson_progress" && c.op === "in" && c.col === "lesson_id")).toBe(true);
  });

  it.each(["enrollments", "modules", "lessons", "lesson_progress"])("%s query error => unavailable", async (t) => {
    h.errors[t] = true;
    expect(await getMyCertificates()).toEqual({ state: "unavailable" });
  });

  it("reads modules and lessons with the admin client so RLS-hidden lessons still count", async () => {
    h.tables.enrollments = [{ id: "e1", course_id: "c1", student_id: "stu-1", status: "active" }];
    // The user-scoped client only sees the one unlocked lesson (RLS); the admin client sees both.
    h.tables.modules = [{ id: "m1", course_id: "c1" }];
    h.tables.lessons = [{ id: "l1", module_id: "m1" }];
    h.adminTables = {
      modules: [{ id: "m1", course_id: "c1" }, { id: "m2", course_id: "c1" }],
      lessons: [{ id: "l1", module_id: "m1" }, { id: "l2", module_id: "m2" }],
    };
    h.tables.lesson_progress = [{ id: "p1", lesson_id: "l1", student_id: "stu-1", status: "completed" }];
    expect(await getMyCertificates()).toMatchObject({ state: "ok", pendingCount: 0 });
    expect(h.adminCalls).toEqual(expect.arrayContaining(["modules", "lessons"]));
    expect(h.adminCalls).not.toContain("enrollments");
    expect(h.adminCalls).not.toContain("lesson_progress");
    h.tables.lesson_progress.push({ id: "p2", lesson_id: "l2", student_id: "stu-1", status: "completed" });
    expect(await getMyCertificates()).toMatchObject({ pendingCount: 1 });
  });

  it("pages past 1000 rows without truncating", async () => {
    h.tables.enrollments = [{ id: "e1", course_id: "c1", student_id: "stu-1", status: "active" }];
    h.tables.modules = [{ id: "m1", course_id: "c1" }];
    h.tables.lessons = Array.from({ length: 1200 }, (_, i) => ({ id: `L${i}`, module_id: "m1" }));
    h.tables.lesson_progress = Array.from({ length: 1199 }, (_, i) => ({ id: `P${i}`, lesson_id: `L${i}`, student_id: "stu-1", status: "completed" }));
    expect(await getMyCertificates()).toMatchObject({ pendingCount: 0 });
    h.tables.lesson_progress.push({ id: "Pz", lesson_id: "L1199", student_id: "stu-1", status: "completed" });
    expect(await getMyCertificates()).toMatchObject({ pendingCount: 1 });
  });
});
