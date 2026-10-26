import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  user: { id: "stu-1", email: "Stu@Example.com" } as { id: string; email: string | null } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  certs: [] as unknown[],
  certError: false,
}));

function chain(rows: Record<string, unknown>[]) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in"]) c[k] = () => c;
  c.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
  return c;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (t: string) => chain(h.tables[t] ?? []),
  }),
}));
vi.mock("@/lib/certs/cert-source", async () => {
  class CertSourceError extends Error {}
  return {
    CertSourceError,
    getCertsByEmail: async () => {
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
  h.user = { id: "stu-1", email: "Stu@Example.com" };
  h.certError = false;
  h.certs = [];
  h.tables = {
    enrollments: [{ course_id: "c1" }, { course_id: "c2" }],
    modules: [{ id: "m1", course_id: "c1" }, { id: "m2", course_id: "c2" }],
    lessons: [{ id: "l1", module_id: "m1" }, { id: "l2", module_id: "m2" }],
    lesson_progress: [{ lesson_id: "l1" }, { lesson_id: "l2" }],
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
    const r = await getMyCertificates();
    expect(r).toMatchObject({ state: "ok", pendingCount: 1 });
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
});
