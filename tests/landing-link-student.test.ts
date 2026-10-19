// @vitest-environment node
// tests/landing-link-student.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ link: vi.fn(), exchange: vi.fn(), getUser: vi.fn(), runInBackground: vi.fn(), enqueue: vi.fn(), runFor: vi.fn(), runDirect: vi.fn() }));
vi.mock("@/lib/data/landing-registrations", () => ({ linkRegistrationsToStudentIds: m.link }));
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueEnrollmentSync: m.enqueue, runJobsFor: m.runFor, runJobsDirect: m.runDirect }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: m.runInBackground }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { exchangeCodeForSession: m.exchange, getUser: m.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "student", full_name: "Ayesha", avatar_url: null }, error: null }) }) }) }),
  }),
}));
vi.mock("@/components/dashboard/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/dashboard/Topbar", () => ({ Topbar: () => null }));
vi.mock("@/lib/data/notifications", () => ({ getNotificationSummary: async () => ({ items: [], unreadCount: 0 }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

import { linkGuestRegistrations } from "@/lib/landing/registration/link-student";
import { GET as callback } from "@/app/auth/callback/route";
import DashboardLayout from "@/app/dashboard/layout";
import { roleHome } from "@/lib/roles";

const confirmed = { id: "user-1", email: "ayesha@example.com", email_confirmed_at: "2026-10-13T10:00:00Z" };
const callbackReq = (q = "?code=abc") => new Request(`http://localhost:3000/auth/callback${q}`) as never;

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.link.mockResolvedValue([{ id: "r1", status: "pending" }]);
  m.enqueue.mockResolvedValue(true);
  m.runFor.mockReturnValue("runFor-promise");
  m.runDirect.mockReturnValue("runDirect-promise");
  m.exchange.mockResolvedValue({ error: null });
  m.getUser.mockResolvedValue({ data: { user: confirmed } });
});

describe("linkGuestRegistrations", () => {
  it("links a confirmed account by its email", async () => {
    expect(await linkGuestRegistrations(confirmed)).toBe(1);
    expect(m.link).toHaveBeenCalledWith("user-1", "ayesha@example.com");
  });
  it("does nothing for no user, no email or an unconfirmed email", async () => {
    expect(await linkGuestRegistrations(null)).toBe(0);
    expect(await linkGuestRegistrations({ id: "user-1", email: null, email_confirmed_at: "2026-10-13T10:00:00Z" })).toBe(0);
    expect(await linkGuestRegistrations({ id: "user-1", email: "a@b.com", email_confirmed_at: null })).toBe(0);
    expect(m.link).not.toHaveBeenCalled();
  });
  it("enrols each linked paid registration with an enrollment_sync job only, then runs the jobs", async () => {
    m.link.mockResolvedValue([{ id: "r1", status: "paid" }, { id: "r2", status: "pending" }, { id: "r3", status: "paid" }]);
    expect(await linkGuestRegistrations(confirmed)).toBe(3);
    expect(m.enqueue.mock.calls).toEqual([["r1"], ["r3"]]);
    expect(m.runFor.mock.calls).toEqual([["r1"], ["r3"]]);
    expect(m.runInBackground).toHaveBeenCalledTimes(2);
    expect(m.runDirect).not.toHaveBeenCalled();
  });
  it("queues nothing when no linked row is paid", async () => {
    m.link.mockResolvedValue([{ id: "r1", status: "pending" }, { id: "r2", status: "underpaid" }]);
    expect(await linkGuestRegistrations(confirmed)).toBe(2);
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.runInBackground).not.toHaveBeenCalled();
  });
  it("queues nothing for an unconfirmed email", async () => {
    await linkGuestRegistrations({ id: "user-1", email: "a@b.com", email_confirmed_at: null });
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("runs enrollment_sync directly when the job could not be queued", async () => {
    m.link.mockResolvedValue([{ id: "r1", status: "paid" }]);
    m.enqueue.mockResolvedValue(false);
    expect(await linkGuestRegistrations(confirmed)).toBe(1);
    expect(m.runDirect).toHaveBeenCalledWith("r1", ["enrollment_sync"]);
    expect(m.runFor).not.toHaveBeenCalled();
    expect(m.runInBackground).toHaveBeenCalledWith("runDirect-promise");
  });
  it("never throws", async () => {
    m.link.mockRejectedValue(new Error("down"));
    await expect(linkGuestRegistrations(confirmed)).resolves.toBe(0);
  });
  it("still returns the linked count if enqueueing throws", async () => {
    m.link.mockResolvedValue([{ id: "r1", status: "paid" }]);
    m.enqueue.mockRejectedValue(new Error("boom"));
    await expect(linkGuestRegistrations(confirmed)).resolves.toBe(1);
  });
});

describe("/auth/callback", () => {
  it("links in the background, so sign-in never waits on it, and redirects to the role's home exactly as before", async () => {
    const res = await callback(callbackReq());
    expect(m.runInBackground).toHaveBeenCalledTimes(1);
    expect(m.link).toHaveBeenCalledWith("user-1", "ayesha@example.com");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost:3000${roleHome("student")}`);
  });
  it("a link that never finishes does not hold up the redirect", async () => {
    m.link.mockReturnValue(new Promise(() => {}));
    const res = await callback(callbackReq());
    expect(res.status).toBe(307);
  });
  it("a linking failure never blocks the sign-in", async () => {
    m.link.mockRejectedValue(new Error("down"));
    const res = await callback(callbackReq());
    expect(res.headers.get("location")).toBe(`http://localhost:3000${roleHome("student")}`);
  });
  it("a failed code exchange links nothing", async () => {
    m.exchange.mockResolvedValue({ error: { message: "bad code" } });
    const res = await callback(callbackReq());
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=auth_callback_failed");
    expect(m.link).not.toHaveBeenCalled();
  });
});

describe("dashboard layout (password sign-ins)", () => {
  it("links in the background", async () => {
    m.link.mockResolvedValue([{ id: "r1", status: "pending" }, { id: "r2", status: "pending" }]);
    await DashboardLayout({ children: null });
    expect(m.runInBackground).toHaveBeenCalledTimes(1);
    expect(m.link).toHaveBeenCalledWith("user-1", "ayesha@example.com");
    await expect(m.runInBackground.mock.calls[0][0]).resolves.toBe(2);
  });
  it("a guest is still redirected to /login and nothing is linked", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    await expect(DashboardLayout({ children: null })).rejects.toThrow("REDIRECT /login");
    expect(m.link).not.toHaveBeenCalled();
  });
});
