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

type Reg = { page_id: string; ref_id: string | null; name: string; email: string; is_test: boolean };
type Job = { id: string; type: string; status: string; attempts: number; last_error: string | null; next_run_at: string; reg: Reg };
const mkReg = (page: string, refId: string | null, name: string, isTest = false): Reg =>
  ({ page_id: page, ref_id: refId, name, email: `${name.split(" ")[0].toLowerCase()}@mail.com`, is_test: isTest });
const job = (id: string, reg: Reg, type: string, status: string, nextRunAt: string, attempts = 1, lastError: string | null = null): Job =>
  ({ id, type, status, attempts, last_error: lastError, next_run_at: nextRunAt, reg });

const sara = mkReg(PAGE, "PZA-PPC-001", "Sara Ali");
const ali = mkReg(PAGE, "PZA-PPC-002", "Ali Raza");
const tester = mkReg(PAGE, "TEST-12345", "Admin Test", true);
const stranger = mkReg(OTHER, "PZA-MDC-001", "Other Page");
const JOBS = [
  job("j1", sara, "sheet_append", "failed", "2026-10-13T10:00:00Z", 5, "Apps Script timed out."),
  job("j2", sara, "email_received", "done", "2026-10-13T10:00:00Z"),
  job("j3", ali, "email_members", "pending", "2026-10-13T10:05:00Z", 2, "Brevo 502"),
  job("j4", ali, "sheet_append", "running", "2026-10-13T10:01:00Z"),
  job("j5", stranger, "sheet_append", "failed", "2026-10-13T08:00:00Z", 5, "x"),
  job("j6", tester, "email_admin", "failed", "2026-10-13T09:00:00Z", 5, "Brevo 401"),
];

/** The fake DB has no embedded joins or counts, so this handler scripts the four job reads. */
function seed(jobs: Job[], bonus?: { failed?: number; waiting?: number }) {
  db.state.handler = (op) => {
    if (op.table === "landing_pages") return { data: { id: PAGE }, error: null };
    const pageEq = op.filters.find(([k, f]) => k === "eq" && f === "landing_registrations.page_id")?.[2];
    const statusEq = op.filters.find(([k, f]) => k === "eq" && f === "status")?.[2];
    const statusIn = op.filters.find(([k, f]) => k === "in" && f === "status")?.[2] as string[] | undefined;
    let rows = jobs.filter((j) => j.reg.page_id === pageEq && (statusEq ? j.status === statusEq : statusIn!.includes(j.status)));
    if (op.head) {
      const extra = statusEq === "failed" ? bonus?.failed ?? 0 : bonus?.waiting ?? 0;
      return { data: null, error: null, count: rows.length + extra };
    }
    for (const [key, asc] of [...op.orders].reverse()) {
      rows = [...rows].sort((x, y) => (asc ? 1 : -1) * String((x as never)[key]).localeCompare(String((y as never)[key])));
    }
    if (op.limit !== undefined) rows = rows.slice(0, op.limit);
    return { data: rows.map((j) => ({ ...j, landing_registrations: j.reg })), error: null };
  };
}

beforeEach(() => { db.reset(); adminOk = true; });

describe("getPageJobSummary", () => {
  it("counts this page's unfinished jobs and lists failed ones first", async () => {
    seed(JOBS);
    const s = await getPageJobSummary(PAGE);
    expect(s).not.toBeNull();
    expect(s!.waiting).toBe(2);
    expect(s!.failed).toBe(2);
    expect(s!.issues.map((i) => i.id)).toEqual(["j6", "j1", "j4", "j3"]);
    expect(s!.issues[0]).toEqual({
      id: "j6", type: "email_admin", status: "failed", attempts: 5, lastError: "Brevo 401", nextRunAt: "2026-10-13T09:00:00Z",
      refId: "TEST-12345", name: "Admin Test", email: "admin@mail.com", isTest: true,
    });
  });
  it("never counts or lists another page's jobs", async () => {
    seed(JOBS);
    const s = await getPageJobSummary(PAGE);
    expect(s!.issues.map((i) => i.id)).not.toContain("j5");
    expect(s!.failed).toBe(2);
    const reads = db.find("landing_jobs", "select");
    expect(reads).toHaveLength(4);
    for (const r of reads) expect(r.filters).toContainEqual(["eq", "landing_registrations.page_id", PAGE]);
  });
  it("uses exact head counts, so a big page is not truncated by max_rows or long id lists", async () => {
    seed(JOBS, { failed: 1500, waiting: 2400 });
    const s = await getPageJobSummary(PAGE);
    expect(s!.failed).toBe(1502);
    expect(s!.waiting).toBe(2402);
    expect(s!.issues).toHaveLength(4);
    const reads = db.find("landing_jobs", "select");
    expect(reads.filter((r) => r.head && r.count)).toHaveLength(2);
    expect(reads.some((r) => r.filters.some(([k, f]) => k === "in" && f === "registration_id"))).toBe(false);
    expect(db.find("landing_registrations", "select")).toHaveLength(0);
  });
  it("caps the issue list at 50 with failed jobs first", async () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      job(`p${String(i).padStart(2, "0")}`, ali, "email_members", "pending", `2026-10-13T11:${String(i % 60).padStart(2, "0")}:00Z`));
    seed([...many, job("f1", sara, "sheet_append", "failed", "2026-10-13T23:00:00Z", 5, "late failure")]);
    const s = await getPageJobSummary(PAGE);
    expect(s!.issues).toHaveLength(50);
    expect(s!.issues[0].id).toBe("f1");
    expect(db.find("landing_jobs", "select").some((r) => r.limit === 50)).toBe(true);
  });
  it("is null for an unknown page and empty for a page with no jobs", async () => {
    db.state.handler = memoryHandler({ landing_pages: [] });
    expect(await getPageJobSummary(PAGE)).toBeNull();
    seed([]);
    expect(await getPageJobSummary(PAGE)).toEqual({ waiting: 0, failed: 0, issues: [] });
  });
  it("throws on a read error instead of reporting all clear", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(getPageJobSummary(PAGE)).rejects.toBeTruthy();
  });
  it.each(["failed", "waiting", "issues"])("throws when only the %s read fails", async (which) => {
    seed(JOBS);
    const ok = db.state.handler;
    db.state.handler = (op) => {
      if (op.table === "landing_jobs") {
        const isFailedCount = op.head && op.filters.some(([k, f, v]) => k === "eq" && f === "status" && v === "failed");
        const isWaitingCount = op.head && !isFailedCount;
        if ((which === "failed" && isFailedCount) || (which === "waiting" && isWaitingCount) || (which === "issues" && !op.head)) {
          return { data: null, error: { code: "57014", message: "timeout" } };
        }
      }
      return ok(op);
    };
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
    seed(JOBS);
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
