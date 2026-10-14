import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let adminOk = true;
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (adminOk
    ? { ok: true, user: { id: "admin-user" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }) }),
}));
const m = vi.hoisted(() => ({ drainDueJobs: vi.fn(), retryFailedJobs: vi.fn(), runInBackground: vi.fn() }));
vi.mock("@/lib/data/landing-jobs", () => ({ drainDueJobs: m.drainDueJobs, retryFailedJobs: m.retryFailedJobs }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: m.runInBackground }));

import { GET as cron } from "@/app/api/cron/landing-jobs/route";
import { POST as retry } from "@/app/api/admin/landing-pages/[id]/jobs/retry/route";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: PAGE_ID }) };
beforeEach(() => {
  adminOk = true;
  for (const f of Object.values(m)) f.mockReset();
  m.drainDueJobs.mockResolvedValue({ ran: 2, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/landing-jobs", () => {
  it("requires the bearer secret when CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const bad = await cron(new Request("http://x", { headers: { authorization: "Bearer nope" } }) as never);
    expect(bad.status).toBe(401);
    expect(m.drainDueJobs).not.toHaveBeenCalled();
    const ok = await cron(new Request("http://x", { headers: { authorization: "Bearer s3cret" } }) as never);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, ran: 2, failed: 0 });
  });
});

describe("POST /api/admin/landing-pages/[id]/jobs/retry", () => {
  it("passes the admin gate through", async () => {
    adminOk = false;
    expect((await retry(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(401);
    expect(m.retryFailedJobs).not.toHaveBeenCalled();
  });
  it("requeues and drains in the background", async () => {
    m.retryFailedJobs.mockResolvedValue(3);
    const res = await retry(new Request("http://x", { method: "POST" }) as never, ctx);
    expect(await res.json()).toEqual({ requeued: 3 });
    expect(m.retryFailedJobs).toHaveBeenCalledWith(PAGE_ID);
    expect(m.runInBackground).toHaveBeenCalledTimes(1);
  });
  it("500 when requeueing fails", async () => {
    m.retryFailedJobs.mockRejectedValue(new Error("db"));
    expect((await retry(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(500);
  });
  it("404s a malformed id without touching jobs", async () => {
    const res = await retry(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id: "page-1" }) });
    expect(res.status).toBe(404);
    expect(m.retryFailedJobs).not.toHaveBeenCalled();
  });
});
