import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let adminOk = true;
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (adminOk
    ? { ok: true, user: { id: "admin-user" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }) }),
}));
const m = vi.hoisted(() => ({ drainDueJobs: vi.fn(), retryFailedJobs: vi.fn(), makeWaitingJobsDue: vi.fn(), runInBackground: vi.fn() }));
vi.mock("@/lib/data/landing-jobs", () => ({ drainDueJobs: m.drainDueJobs, retryFailedJobs: m.retryFailedJobs, makeWaitingJobsDue: m.makeWaitingJobsDue }));
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
  const call = (headers: Record<string, string> = {}) => cron(new Request("http://x", { headers }) as never);
  it("401s when CRON_SECRET is unset, even with a header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer " })).status).toBe(401);
    expect(m.drainDueJobs).not.toHaveBeenCalled();
  });
  it("401s a missing or wrong header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    expect(m.drainDueJobs).not.toHaveBeenCalled();
  });
  it("runs with the correct bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const ok = await call({ authorization: "Bearer s3cret" });
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
  it("also makes the page's waiting jobs due now before draining", async () => {
    m.retryFailedJobs.mockResolvedValue(0);
    m.makeWaitingJobsDue.mockResolvedValue(4);
    await retry(new Request("http://x", { method: "POST" }) as never, ctx);
    expect(m.makeWaitingJobsDue).toHaveBeenCalledWith(PAGE_ID);
    expect(m.makeWaitingJobsDue.mock.invocationCallOrder[0]).toBeLessThan(m.drainDueJobs.mock.invocationCallOrder[0]);
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
