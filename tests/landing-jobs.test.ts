import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const handlers = vi.hoisted(() => ({
  sheet_append: vi.fn(), sheet_status: vi.fn(), email_received: vi.fn(), email_members: vi.fn(), email_admin: vi.fn(),
  enrollment_sync: vi.fn(), email_status: vi.fn(),
}));
vi.mock("@/lib/landing/registration/job-handlers", () => ({ JOB_HANDLERS: handlers }));

import { enqueueJobs, enqueueStatusEffects, enqueueEnrollmentSync, JOB_TYPES, runJobsFor, drainDueJobs, retryFailedJobs, requeueSheetAppendJobs, makeWaitingJobsDue, nextRunAt } from "@/lib/data/landing-jobs";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1", registration_id: "reg-1", type: "email_received", status: "pending", attempts: 0,
  next_run_at: "2026-10-13T09:00:00.000Z", last_error: null, created_at: "2026-10-13T09:00:00.000Z", ...over,
});

beforeEach(() => {
  db.reset();
  for (const h of Object.values(handlers)) h.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("backoff", () => {
  it("waits 1, 5, 15 then 60 minutes", () => {
    expect([1, 2, 3, 4, 9].map((n) => nextRunAt(n, NOW))).toEqual([
      "2026-10-13T10:01:00.000Z", "2026-10-13T10:05:00.000Z", "2026-10-13T10:15:00.000Z", "2026-10-13T11:00:00.000Z", "2026-10-13T11:00:00.000Z",
    ]);
  });
});

describe("enqueueJobs", () => {
  it("inserts one due pending job per type", async () => {
    db.state.handler = memoryHandler({});
    await enqueueJobs("reg-1", ["sheet_append", "email_received"]);
    expect(db.find("landing_jobs", "insert")[0].payload).toEqual([
      { registration_id: "reg-1", type: "sheet_append", status: "pending", attempts: 0, next_run_at: NOW.toISOString() },
      { registration_id: "reg-1", type: "email_received", status: "pending", attempts: 0, next_run_at: NOW.toISOString() },
    ]);
  });
  it("logs instead of throwing on a write error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(enqueueJobs("reg-1", ["email_admin"])).resolves.toBe(false);
  });
  it("treats a duplicate (already queued) as success, so a retry is idempotent", async () => {
    db.state.handler = () => ({ data: null, error: { code: "23505" } });
    await expect(enqueueJobs("reg-1", ["email_admin"])).resolves.toBe(true);
  });
});

describe("enqueueStatusEffects", () => {
  it("upserts both status jobs back to pending with a fresh budget", async () => {
    db.state.handler = memoryHandler({});
    await expect(enqueueStatusEffects("reg-1")).resolves.toBe(true);
    const up = db.find("landing_jobs", "upsert")[0];
    expect(up.payload).toEqual([
      { registration_id: "reg-1", type: "enrollment_sync", status: "pending", attempts: 0, next_run_at: NOW.toISOString(), last_error: null },
      { registration_id: "reg-1", type: "email_status", status: "pending", attempts: 0, next_run_at: NOW.toISOString(), last_error: null },
    ]);
    expect(up.upsertOptions).toMatchObject({ onConflict: "registration_id,type" });
  });
  it("never throws and reports failure", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(enqueueStatusEffects("reg-1")).resolves.toBe(false);
    db.state.handler = () => { throw new Error("socket closed"); };
    await expect(enqueueStatusEffects("reg-1")).resolves.toBe(false);
  });
  it("JOB_TYPES run order", () => {
    expect(JOB_TYPES).toEqual(["email_received", "sheet_append", "sheet_status", "enrollment_sync", "email_status", "email_members", "email_admin"]);
  });
});

describe("enqueueEnrollmentSync", () => {
  it("upserts a single enrollment_sync job back to pending with a fresh budget", async () => {
    db.state.handler = memoryHandler({});
    await expect(enqueueEnrollmentSync("reg-1")).resolves.toBe(true);
    const up = db.find("landing_jobs", "upsert")[0];
    expect(up.payload).toEqual({ registration_id: "reg-1", type: "enrollment_sync", status: "pending", attempts: 0, next_run_at: NOW.toISOString(), last_error: null });
    expect(up.upsertOptions).toMatchObject({ onConflict: "registration_id,type" });
  });
  it("never throws and reports failure", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(enqueueEnrollmentSync("reg-1")).resolves.toBe(false);
    db.state.handler = () => { throw new Error("socket closed"); };
    await expect(enqueueEnrollmentSync("reg-1")).resolves.toBe(false);
  });
});

describe("runJobsFor", () => {
  it("runs this registration's due jobs, confirmation email before the sheet row, and marks them done", async () => {
    const order: string[] = [];
    for (const [type, h] of Object.entries(handlers)) h.mockImplementation(async () => { order.push(type); });
    const store = { landing_jobs: [
      job({ id: "j-admin", type: "email_admin" }),
      job({ id: "j-sheet", type: "sheet_append" }),
      job({ id: "j-mail", type: "email_received" }),
      job({ id: "j-other", registration_id: "reg-2" }),
      job({ id: "j-later", type: "email_members", next_run_at: "2026-10-13T11:00:00.000Z" }),
    ] };
    db.state.handler = memoryHandler(store);
    await runJobsFor("reg-1");
    expect(order).toEqual(["email_received", "sheet_append", "email_admin"]);
    expect(store.landing_jobs.find((j) => j.id === "j-sheet")).toMatchObject({ status: "done", attempts: 1, last_error: null });
    expect(store.landing_jobs.find((j) => j.id === "j-other")).toMatchObject({ status: "pending", attempts: 0 });
    expect(store.landing_jobs.find((j) => j.id === "j-later")).toMatchObject({ status: "pending" });
  });
  it("a failure goes back to pending with backoff and the error", async () => {
    handlers.email_received.mockRejectedValue(new Error("Brevo 502"));
    const store = { landing_jobs: [job()] };
    db.state.handler = memoryHandler(store);
    await runJobsFor("reg-1");
    expect(store.landing_jobs[0]).toMatchObject({ status: "pending", attempts: 1, last_error: "Brevo 502", next_run_at: "2026-10-13T10:01:00.000Z" });
  });
  it("a re-enqueue during a running job is not overwritten by the stale worker's done update", async () => {
    const store = { landing_jobs: [job({ type: "sheet_status" })] };
    db.state.handler = memoryHandler(store);
    handlers.sheet_status = vi.fn(async () => {
      Object.assign(store.landing_jobs[0], { status: "pending", attempts: 0, last_error: null }); // enqueueSheetStatus reset
    });
    await runJobsFor("reg-1");
    expect(store.landing_jobs[0]).toMatchObject({ status: "pending", attempts: 0 });
  });
  it("a re-enqueue during a running job is not overwritten by the stale worker's failure update", async () => {
    const store = { landing_jobs: [job({ type: "sheet_status" })] };
    db.state.handler = memoryHandler(store);
    handlers.sheet_status = vi.fn(async () => {
      Object.assign(store.landing_jobs[0], { status: "pending", attempts: 0, last_error: null });
      throw new Error("late failure");
    });
    await runJobsFor("reg-1");
    expect(store.landing_jobs[0]).toMatchObject({ status: "pending", attempts: 0, last_error: null });
  });
  it("the fifth failure is final", async () => {
    handlers.email_received.mockRejectedValue(new Error("still down"));
    const store = { landing_jobs: [job({ attempts: 4 })] };
    db.state.handler = memoryHandler(store);
    await runJobsFor("reg-1");
    expect(store.landing_jobs[0]).toMatchObject({ status: "failed", attempts: 5, last_error: "still down" });
  });
  it("does not run a job another worker already claimed", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: [job()], error: null } : { data: null, error: null });
    await runJobsFor("reg-1");
    expect(handlers.email_received).not.toHaveBeenCalled();
    const claim = db.find("landing_jobs", "update")[0];
    expect(filterValue(claim, "eq", "attempts")).toBe(0);
    expect(filterValue(claim, "in", "status")).toEqual(["pending", "running"]);
  });
  it("never throws", async () => {
    db.state.handler = () => { throw new Error("socket closed"); };
    await expect(runJobsFor("reg-1")).resolves.toBeUndefined();
  });
});

describe("drainDueJobs and retryFailedJobs", () => {
  it("runs due pending jobs and expired running leases across registrations", async () => {
    handlers.email_admin.mockRejectedValue(new Error("x"));
    db.state.handler = memoryHandler({ landing_jobs: [
      job({ id: "a" }),
      job({ id: "b", registration_id: "reg-2", type: "email_admin" }),
      job({ id: "c", status: "running", attempts: 1, next_run_at: "2026-10-13T09:30:00.000Z" }),
      job({ id: "d", status: "running", attempts: 1, next_run_at: "2026-10-13T10:05:00.000Z" }),
      job({ id: "e", status: "done" }),
    ] });
    expect(await drainDueJobs(10)).toEqual({ ran: 3, failed: 1 });
  });
  it("requeues failed jobs of one page through the FK join, in batches, counting updates", async () => {
    const failed = Array.from({ length: 150 }, (_, i) => ({ id: `f${i}`, status: "failed" }));
    const updates: string[][] = [];
    db.state.handler = (op) => {
      if (op.op === "select") {
        expect(filterValue(op, "eq", "landing_registrations.page_id")).toBe("page-1");
        expect(filterValue(op, "eq", "status")).toBe("failed");
        const rows = failed.filter((j) => j.status === "failed").slice(0, op.limit);
        return { data: rows.map((j) => ({ id: j.id, landing_registrations: { page_id: "page-1" } })), error: null };
      }
      const ids = filterValue(op, "in", "id") as string[];
      updates.push(ids);
      expect(op.payload).toMatchObject({ status: "pending", attempts: 0, next_run_at: NOW.toISOString() });
      for (const j of failed) if (ids.includes(j.id)) j.status = "pending";
      return { data: ids.map((id) => ({ id })), error: null };
    };
    expect(await retryFailedJobs("page-1")).toBe(150);
    expect(updates.map((u) => u.length)).toEqual([100, 50]);
  });
  it("requeueSheetAppendJobs resets every sheet_append job of the page, done ones included, in batches", async () => {
    const rows = Array.from({ length: 230 }, (_, i) => ({ id: `s${i}`, status: ["done", "failed", "pending", "running"][i % 4] }));
    const updates: string[][] = [];
    db.state.handler = (op) => {
      if (op.op === "select") {
        expect(filterValue(op, "eq", "landing_registrations.page_id")).toBe("page-1");
        expect(filterValue(op, "eq", "type")).toBe("sheet_append");
        expect(filterValue(op, "in", "status")).toEqual(["pending", "running", "failed", "done"]);
        return { data: rows.slice(0, op.limit).map((j) => ({ id: j.id, landing_registrations: { page_id: "page-1" } })), error: null };
      }
      const ids = filterValue(op, "in", "id") as string[];
      updates.push(ids);
      expect(op.payload).toEqual({ status: "pending", attempts: 0, next_run_at: NOW.toISOString(), last_error: null });
      return { data: ids.map((id) => ({ id })), error: null };
    };
    expect(await requeueSheetAppendJobs("page-1")).toBe(230);
    expect(updates.map((u) => u.length)).toEqual([100, 100, 30]);
    expect(new Set(updates.flat()).size).toBe(230);
  });
  it("makeWaitingJobsDue only touches pending jobs: a running job keeps its lease", async () => {
    const rows = [
      { id: "w1", status: "pending", next_run_at: "2026-10-13T10:30:00.000Z" },
      { id: "r1", status: "running", next_run_at: "2026-10-13T10:09:00.000Z" },
    ];
    db.state.handler = (op) => {
      const allowed = filterValue(op, "in", "status") as string[];
      expect(allowed).toEqual(["pending"]);
      if (op.op === "select") {
        expect(filterValue(op, "eq", "landing_registrations.page_id")).toBe("page-1");
        return { data: rows.filter((r) => allowed.includes(r.status)).map((r) => ({ id: r.id })), error: null };
      }
      expect(op.payload).toEqual({ next_run_at: NOW.toISOString() });
      const hit = rows.filter((r) => allowed.includes(r.status) && (filterValue(op, "in", "id") as string[]).includes(r.id));
      for (const r of hit) r.next_run_at = NOW.toISOString();
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    };
    expect(await makeWaitingJobsDue("page-1")).toBe(1);
    expect(rows.find((r) => r.id === "r1")!.next_run_at).toBe("2026-10-13T10:09:00.000Z");
    expect(rows.find((r) => r.id === "w1")!.next_run_at).toBe(NOW.toISOString());
  });
  it("throws when the lookup fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(retryFailedJobs("page-1")).rejects.toBeTruthy();
  });
});
