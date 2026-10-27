import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  createSessionSend: vi.fn(), runEmailSend: vi.fn(), due: vi.fn(), pending: vi.fn(),
}));
vi.mock("@/lib/data/session-emails", () => ({ createSessionSend: m.createSessionSend }));
vi.mock("@/lib/data/participant-sends", () => ({ runEmailSend: m.runEmailSend }));
vi.mock("@/lib/data/session-cron", () => ({
  listDueReminderSessionIds: m.due, listSessionSendsWithPending: m.pending,
}));

import { GET } from "@/app/api/cron/session-emails/route";

const call = (auth?: string) =>
  GET(new Request("http://x", { headers: auth ? { authorization: auth } : {} }) as never);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = "s3cret";
  m.due.mockResolvedValue([]);
  m.pending.mockResolvedValue([]);
  m.runEmailSend.mockResolvedValue({ sent: 0, failed: 0, pending: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { delete process.env.CRON_SECRET; });

describe("session-emails cron", () => {
  it("401 without or with wrong bearer, calls nothing", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(m.due).not.toHaveBeenCalled();
    expect(m.createSessionSend).not.toHaveBeenCalled();
  });
  it("401 when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect(m.due).not.toHaveBeenCalled();
  });
  it("creates a send for a due session and runs it", async () => {
    m.due.mockResolvedValue(["s1"]);
    m.createSessionSend.mockResolvedValue({ ok: true, sendId: "send1", count: 2 });
    m.pending.mockResolvedValue(["send1"]);
    m.runEmailSend.mockResolvedValue({ sent: 2, failed: 1, pending: 0 });
    const res = await call("Bearer s3cret");
    expect(await res.json()).toEqual({ ok: true, created: 1, sent: 2, failed: 1 });
    expect(m.createSessionSend).toHaveBeenCalledWith("s1", "reminder");
    expect(m.runEmailSend).toHaveBeenCalledWith("send1", 40);
  });
  it("second call for the same session creates nothing (already sent)", async () => {
    m.due.mockResolvedValueOnce(["s1"]).mockResolvedValueOnce(["s1"]);
    m.createSessionSend.mockResolvedValueOnce({ ok: true, sendId: "a", count: 1 })
      .mockResolvedValueOnce({ ok: false, reason: "already_sent" });
    const a = await (await call("Bearer s3cret")).json();
    const b = await (await call("Bearer s3cret")).json();
    expect(a.created).toBe(1);
    expect(b).toEqual({ ok: true, created: 0, sent: 0, failed: 0 });
  });
  it("a not-yet-due session is untouched", async () => {
    const res = await call("Bearer s3cret");
    expect(await res.json()).toEqual({ ok: true, created: 0, sent: 0, failed: 0 });
    expect(m.createSessionSend).not.toHaveBeenCalled();
  });
  it("a failing session does not stop the others and leaks nothing", async () => {
    m.due.mockResolvedValue(["bad", "good"]);
    m.createSessionSend.mockRejectedValueOnce(new Error("boom a@b.com")).mockResolvedValueOnce({ ok: true, sendId: "g", count: 1 });
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 1, sent: 0, failed: 1 });
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("a@b.com");
  });
  it("a failing send run does not stop the next one", async () => {
    m.pending.mockResolvedValue(["x", "y"]);
    m.runEmailSend.mockRejectedValueOnce(new Error("bad")).mockResolvedValueOnce({ sent: 3, failed: 0, pending: 0 });
    expect(await (await call("Bearer s3cret")).json()).toEqual({ ok: true, created: 0, sent: 3, failed: 1 });
  });
  it("caps sends per call", async () => {
    await call("Bearer s3cret");
    expect(m.pending).toHaveBeenCalledWith(5);
  });
});
