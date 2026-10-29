// tests/attendance-admin-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const h = vi.hoisted(() => ({
  admin: true,
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionById: vi.fn(),
  markPresent: vi.fn(),
  unmarkPresent: vi.fn(),
  markAllPresent: vi.fn(),
  isLiveEnrolled: vi.fn(),
  setMinPct: vi.fn(),
  createSessionSend: vi.fn(),
  runEmailSend: vi.fn(),
  listSessionSendState: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/data/attendance", () => ({
  createSession: h.createSession,
  updateSession: h.updateSession,
  deleteSession: h.deleteSession,
  getSessionById: h.getSessionById,
  markPresent: h.markPresent,
  unmarkPresent: h.unmarkPresent,
  markAllPresent: h.markAllPresent,
  isLiveEnrolled: h.isLiveEnrolled,
  setMinPct: h.setMinPct,
}));
vi.mock("@/lib/data/session-emails", () => ({
  createSessionSend: h.createSessionSend,
  listSessionSendState: h.listSessionSendState,
}));
vi.mock("@/lib/data/participant-sends", () => ({ runEmailSend: h.runEmailSend }));

import {
  addSession, saveSession, removeSession, setOverride, toggleMark, markEveryonePresent, saveMinPct,
  sendReminderNow, emailUpdatedTime, resendClassDetails,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const PAGE = "00000000-0000-4000-8000-000000000001";
const SESS = "00000000-0000-4000-8000-000000000002";
const PERSON = "00000000-0000-4000-8000-000000000003";
const YESTERDAY = new Date(Date.now() - 86400_000).toISOString();
const form = (over: Record<string, unknown> = {}) => ({
  number: 1, title: "Day 1", startsAtLocal: "2026-11-03T20:00", zoomUrl: "https://zoom.us/j/1", kahootUrl: "",
  includeKahoot: false, includeAttendanceLink: true, emailEnabled: true, emailLeadMinutes: 60, ...over,
});
const session = (over: Record<string, unknown> = {}) => ({
  id: SESS, page_id: PAGE, number: 1, starts_at: YESTERDAY, window_override: "auto", ...over,
});

beforeEach(() => {
  h.admin = true;
  for (const v of Object.values(h)) if (typeof v === "function") v.mockReset();
  h.createSession.mockResolvedValue({ ok: true, id: SESS });
  h.updateSession.mockResolvedValue({ ok: true });
  h.getSessionById.mockResolvedValue(session());
  h.isLiveEnrolled.mockResolvedValue(true);
  h.markPresent.mockResolvedValue({ created: true });
  h.markAllPresent.mockResolvedValue({ added: 3 });
  h.setMinPct.mockResolvedValue({ ok: true });
  h.listSessionSendState.mockResolvedValue({});
  h.createSessionSend.mockResolvedValue({ ok: true, sendId: "send-1", count: 5 });
  h.runEmailSend.mockResolvedValue({ sent: 5, failed: 0, pending: 0 });
});

describe("non-admin callers", () => {
  it("are refused by every action and nothing is written", async () => {
    h.admin = false;
    const results = await Promise.all([
      addSession(PAGE, form()),
      saveSession(SESS, form()),
      removeSession(SESS),
      setOverride(SESS, "open"),
      toggleMark(SESS, PERSON, true),
      markEveryonePresent(SESS),
      saveMinPct(PAGE, 80),
      sendReminderNow(SESS),
      emailUpdatedTime(SESS),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    for (const fn of [h.createSession, h.updateSession, h.deleteSession, h.markPresent, h.unmarkPresent, h.markAllPresent, h.setMinPct, h.createSessionSend, h.runEmailSend]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("addSession", () => {
  it("rejects a malformed time without creating anything", async () => {
    const r = await addSession(PAGE, form({ startsAtLocal: "next tuesday" }));
    expect(r).toEqual({ ok: false, message: "Please enter a valid date and time" });
    expect(h.createSession).not.toHaveBeenCalled();
  });
  it("converts the PKT time to UTC and creates the session", async () => {
    const r = await addSession(PAGE, form());
    expect(r.ok).toBe(true);
    expect(h.createSession).toHaveBeenCalledWith(PAGE, expect.objectContaining({ startsAt: "2026-11-03T15:00:00.000Z", number: 1 }));
  });
  it("passes on a duplicate-number message", async () => {
    h.createSession.mockResolvedValue({ ok: false, message: "Session number already used" });
    expect(await addSession(PAGE, form())).toEqual({ ok: false, message: "Session number already used" });
  });
});

describe("admin writes are not limited by the start time", () => {
  it("saveSession works for a session that started yesterday", async () => {
    const r = await saveSession(SESS, form());
    expect(r.ok).toBe(true);
    expect(h.updateSession).toHaveBeenCalledWith(SESS, expect.objectContaining({ startsAt: "2026-11-03T15:00:00.000Z" }));
  });
  it("saveSession with a bad time writes nothing", async () => {
    const r = await saveSession(SESS, form({ startsAtLocal: "" }));
    expect(r.ok).toBe(false);
    expect(h.updateSession).not.toHaveBeenCalled();
  });
  it("saveSession warns when the time changed after a reminder went out", async () => {
    h.listSessionSendState.mockResolvedValue({ [SESS]: { reminderAt: "2026-10-30T00:00:00Z", updateAt: null } });
    const r = await saveSession(SESS, form());
    expect(r).toMatchObject({ ok: true, staleReminder: true });
  });
  it("saveSession does not warn when the time is unchanged", async () => {
    h.listSessionSendState.mockResolvedValue({ [SESS]: { reminderAt: "2026-10-30T00:00:00Z", updateAt: null } });
    h.getSessionById.mockResolvedValue(session({ starts_at: "2026-11-03T15:00:00.000Z" }));
    const r = await saveSession(SESS, form());
    expect(r.staleReminder).toBeFalsy();
  });
  it("setOverride works for a session that started yesterday", async () => {
    expect((await setOverride(SESS, "open")).ok).toBe(true);
    expect(h.updateSession).toHaveBeenCalledWith(SESS, { windowOverride: "open" });
  });
  it("setOverride refuses an unknown value", async () => {
    expect((await setOverride(SESS, "wide" as never)).ok).toBe(false);
    expect(h.updateSession).not.toHaveBeenCalled();
  });
  it("removeSession deletes", async () => {
    expect((await removeSession(SESS)).ok).toBe(true);
    expect(h.deleteSession).toHaveBeenCalledWith(SESS);
  });
});

describe("toggleMark", () => {
  it("refuses a person who is not live enrolled", async () => {
    h.isLiveEnrolled.mockResolvedValue(false);
    const r = await toggleMark(SESS, PERSON, true);
    expect(r.ok).toBe(false);
    expect(h.markPresent).not.toHaveBeenCalled();
  });
  it("marks present while the check-in window is closed", async () => {
    const r = await toggleMark(SESS, PERSON, true);
    expect(r.ok).toBe(true);
    expect(h.isLiveEnrolled).toHaveBeenCalledWith(PAGE, PERSON);
    expect(h.markPresent).toHaveBeenCalledWith(SESS, PERSON, "admin", "admin-1");
  });
  it("removes a mark without checking enrollment", async () => {
    h.isLiveEnrolled.mockResolvedValue(false);
    const r = await toggleMark(SESS, PERSON, false);
    expect(r.ok).toBe(true);
    expect(h.unmarkPresent).toHaveBeenCalledWith(SESS, PERSON);
  });
  it("fails plainly when the session is gone", async () => {
    h.getSessionById.mockResolvedValue(null);
    expect((await toggleMark(SESS, PERSON, true)).ok).toBe(false);
  });
});

describe("markEveryonePresent, saveMinPct", () => {
  it("reports how many were added", async () => {
    const r = await markEveryonePresent(SESS);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("3");
    expect(h.markAllPresent).toHaveBeenCalledWith(SESS, "admin-1");
  });
  it("saves a valid minimum and refuses an invalid one", async () => {
    expect((await saveMinPct(PAGE, 80)).ok).toBe(true);
    h.setMinPct.mockResolvedValue({ ok: false });
    expect((await saveMinPct(PAGE, 120)).ok).toBe(false);
  });
});

describe("email buttons", () => {
  it("send the email once for a reminder", async () => {
    const r = await sendReminderNow(SESS);
    expect(r.ok).toBe(true);
    expect(h.createSessionSend).toHaveBeenCalledWith(SESS, "reminder");
    expect(h.runEmailSend).toHaveBeenCalledWith("send-1", 40);
  });
  it("send the update email", async () => {
    await emailUpdatedTime(SESS);
    expect(h.createSessionSend).toHaveBeenCalledWith(SESS, "update");
    h.createSessionSend.mockClear();
    await resendClassDetails(SESS);
    expect(h.createSessionSend).toHaveBeenCalledWith(SESS, "update", { resend: true });
  });
  it.each([
    ["no_zoom", "No Zoom link on this session"],
    ["already_sent", "Reminder already sent"],
    ["started", "Session already started"],
    ["disabled", "Reminders are switched off for this session"],
    ["no_recipients", "Nobody to send to"],
    ["not_set_up", "Email is not set up"],
    ["too_soon", "Wait a minute before sending again"],
  ])("explains %s in plain words", async (reason, text) => {
    h.createSessionSend.mockResolvedValue({ ok: false, reason });
    const r = await sendReminderNow(SESS);
    expect(r).toEqual({ ok: false, message: text });
    expect(h.runEmailSend).not.toHaveBeenCalled();
  });
});

describe("send result messages", () => {
  it("says how many got the email when all went out", async () => {
    expect(await sendReminderNow(SESS)).toEqual({ ok: true, message: "Email sent to 5 people" });
  });
  it("reports partial failure and still counts as ok", async () => {
    h.runEmailSend.mockResolvedValue({ sent: 3, failed: 2, pending: 0 });
    expect(await sendReminderNow(SESS)).toEqual({ ok: true, message: "Sent to 3 people, 2 could not be sent. Open Messages sent to retry." });
  });
  it("is not ok when nothing could be sent", async () => {
    h.runEmailSend.mockResolvedValue({ sent: 0, failed: 4, pending: 0 });
    const r = await emailUpdatedTime(SESS);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("0 people, 4 could not be sent");
  });
  it("says the rest will follow when some are still pending", async () => {
    h.runEmailSend.mockResolvedValue({ sent: 40, failed: 0, pending: 60 });
    expect(await sendReminderNow(SESS)).toEqual({ ok: true, message: "Sent to 40 people so far. The rest will go out within a few minutes." });
  });
  it("does not claim success when sending throws", async () => {
    h.runEmailSend.mockRejectedValue(new Error("boom"));
    expect(await sendReminderNow(SESS)).toEqual({
      ok: false,
      message: "The email was started but may not have gone out. Check Messages sent before trying again.",
    });
  });
});

describe("id checks", () => {
  it("refuse malformed ids without touching the database", async () => {
    const results = await Promise.all([
      addSession("nope", form()),
      saveSession("nope", form()),
      removeSession("nope"),
      setOverride("nope", "open"),
      toggleMark("nope", PERSON, true),
      toggleMark(SESS, "nope", true),
      markEveryonePresent("nope"),
      saveMinPct("nope", 80),
      sendReminderNow("nope"),
      emailUpdatedTime("nope"),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    for (const fn of [h.getSessionById, h.createSession, h.updateSession, h.deleteSession, h.markPresent, h.unmarkPresent, h.markAllPresent, h.setMinPct, h.createSessionSend, h.isLiveEnrolled]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
  it("removeSession on a missing session is not ok", async () => {
    h.getSessionById.mockResolvedValue(null);
    expect((await removeSession(SESS)).ok).toBe(false);
    expect(h.deleteSession).not.toHaveBeenCalled();
  });
});
