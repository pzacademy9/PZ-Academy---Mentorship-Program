import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
let adminOk = true;
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (adminOk
    ? { ok: true, user: { id: "admin-user" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));

import { getPageJobSummary } from "@/lib/data/landing-ops";
import { GET as getJobs } from "@/app/api/admin/landing-pages/[id]/jobs/route";

const PAGE = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ctx = (id = PAGE) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://x") as never;

const reg = (id: string, page: string, rowType: string, refId: string | null, name: string, isTest = false) =>
  ({ id, page_id: page, row_type: rowType, ref_id: refId, name, email: `${id}@mail.com`, is_test: isTest });
const job = (id: string, registrationId: string, type: string, status: string, nextRunAt: string, attempts = 1, lastError: string | null = null) =>
  ({ id, registration_id: registrationId, type, status, attempts, last_error: lastError, next_run_at: nextRunAt });

function seed() {
  db.state.handler = memoryHandler({
    landing_pages: [{ id: PAGE }, { id: OTHER }],
    landing_registrations: [
      reg("r1", PAGE, "individual", "PZA-PPC-001", "Sara Ali"),
      reg("r2", PAGE, "lead", "PZA-PPC-002", "Ali Raza"),
      reg("r3", PAGE, "member", null, "Member Three"),
      reg("r4", OTHER, "individual", "PZA-MDC-001", "Other Page"),
      reg("r5", PAGE, "individual", "TEST-12345", "Admin Test", true),
    ],
    landing_jobs: [
      job("j1", "r1", "sheet_append", "failed", "2026-10-13T10:00:00Z", 5, "Apps Script timed out."),
      job("j2", "r1", "email_received", "done", "2026-10-13T10:00:00Z"),
      job("j3", "r2", "email_members", "pending", "2026-10-13T10:05:00Z", 2, "Brevo 502"),
      job("j4", "r2", "sheet_append", "running", "2026-10-13T10:01:00Z"),
      job("j5", "r4", "sheet_append", "failed", "2026-10-13T08:00:00Z", 5, "x"),
      job("j6", "r5", "email_admin", "failed", "2026-10-13T09:00:00Z", 5, "Brevo 401"),
    ],
  });
}

beforeEach(() => { db.reset(); adminOk = true; });

describe("getPageJobSummary", () => {
  it("counts this page's unfinished jobs and lists failed ones first", async () => {
    seed();
    const s = await getPageJobSummary(PAGE);
    expect(s).not.toBeNull();
    expect(s!.waiting).toBe(2);
    expect(s!.failed).toBe(2);
    expect(s!.issues.map((i) => i.id)).toEqual(["j6", "j1", "j4", "j3"]);
    expect(s!.issues[0]).toEqual({
      id: "j6", type: "email_admin", status: "failed", attempts: 5, lastError: "Brevo 401", nextRunAt: "2026-10-13T09:00:00Z",
      refId: "TEST-12345", name: "Admin Test", email: "r5@mail.com", isTest: true,
    });
  });
  it("is null for an unknown page and empty for a page with no registrations", async () => {
    db.state.handler = memoryHandler({ landing_pages: [{ id: OTHER }], landing_registrations: [], landing_jobs: [] });
    expect(await getPageJobSummary(PAGE)).toBeNull();
    expect(await getPageJobSummary(OTHER)).toEqual({ waiting: 0, failed: 0, issues: [] });
    expect(db.find("landing_jobs", "select")).toHaveLength(0);
  });
  it("throws on a read error instead of reporting all clear", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(getPageJobSummary(PAGE)).rejects.toBeTruthy();
  });
});

describe("GET /api/admin/landing-pages/[id]/jobs", () => {
  it("passes the admin gate response through without reading data", async () => {
    adminOk = false;
    expect((await getJobs(req(), ctx())).status).toBe(403);
    expect(db.state.ops).toHaveLength(0);
  });
  it("404s a malformed id before any query, and an unknown page", async () => {
    const bad = await getJobs(req(), ctx("not-a-uuid"));
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual({ error: "Page not found" });
    expect(db.state.ops).toHaveLength(0);
    db.state.handler = memoryHandler({ landing_pages: [] });
    expect((await getJobs(req(), ctx())).status).toBe(404);
  });
  it("returns the summary uncached", async () => {
    seed();
    const res = await getJobs(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ waiting: 2, failed: 2 });
    expect(body.issues).toHaveLength(4);
  });
  it("500 on a read error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    const res = await getJobs(req(), ctx());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not load the background tasks.");
  });
});
