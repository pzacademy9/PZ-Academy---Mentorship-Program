import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  sendReminderNow: vi.fn(),
  resendClassDetails: vi.fn(),
  emailMissingOnly: vi.fn(),
  emailNewZoomLink: vi.fn(),
  emailUpdatedTime: vi.fn(),
  sendTestEmailToMe: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  write: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  sendReminderNow: h.sendReminderNow,
  resendClassDetails: h.resendClassDetails,
  emailMissingOnly: h.emailMissingOnly,
  emailNewZoomLink: h.emailNewZoomLink,
  emailUpdatedTime: h.emailUpdatedTime,
  sendTestEmailToMe: h.sendTestEmailToMe,
}));

import { clockWindowPkt } from "@/lib/classes/share-messages";
import { ClassActionRow } from "@/components/admin/classes/ClassActionRow";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";

const NOW = new Date("2026-11-10T07:00:00.000Z");
const cls = (over: Partial<ClassSummary> = {}): ClassSummary => ({
  id: "s1", number: 1, title: "Intro", speaker: "Dr A",
  startsAt: "2026-11-10T14:00:00.000Z", endsAt: "2026-11-10T16:00:00.000Z",
  status: "today", presentCount: 0, enrolledLive: 0,
  attendanceLink: "https://x.test/attend/code0001",
  feedbackLink: "https://x.test/feedback/slug-one", feedbackSessionId: "f1",
  feedbackCount: 0, feedbackAvg: null, quiz: { saved: false, players: 0 },
  slug: "x",
  ...over,
} as ClassSummary);
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1", page_id: "p", number: 1, title: "Intro", speaker: "Dr A",
  starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z",
  zoom_url: "https://zoom.us/j/1", email_enabled: true, email_lead_minutes: 60,
  public_code: "code0001", window_override: "auto",
  audience: { mode: "live", modules: "all" },
  ...over,
} as unknown as SessionRow);

function row(over: { c?: ClassSummary; s?: SessionRow; sends?: SessionSendState; onNeedAudience?: () => void; batchWindow?: { open: number; close: number } } = {}) {
  return render(
    <ClassActionRow batchTitle="PPC Batch 3" cls={over.c ?? cls()} session={over.s ?? session()} sends={over.sends} now={NOW} onNeedAudience={over.onNeedAudience ?? vi.fn()} batchWindow={over.batchWindow} />,
  );
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.confirm.mockResolvedValue(true);
  h.sendReminderNow.mockResolvedValue({ ok: true, message: "Email sent" });
  h.resendClassDetails.mockResolvedValue({ ok: true, message: "Email sent" });
  h.write.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: h.write }, configurable: true });
});

describe("ClassActionRow", () => {
  it("copies the links or the messages from the menus", async () => {
    row();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(h.write).toHaveBeenCalledWith("https://x.test/attend/code0001"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy feedback link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy with message" }));
    await waitFor(() => expect(h.write).toHaveBeenLastCalledWith(expect.stringContaining("Day 1 Feedback Form:")));
    expect(h.write.mock.calls[1][0]).toContain("https://x.test/feedback/slug-one");
    expect(h.write.mock.calls[1][0]).toContain("PPC Batch 3");
  });

  it("copies the attendance message", async () => {
    row();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy with message" }));
    await waitFor(() => expect(h.write).toHaveBeenCalledWith(expect.stringContaining("PPC Batch 3 | _Attendance Portal_")));
  });

  it("the attendance message carries the real open and close times of a 20/10 window", async () => {
    row({ s: session({ checkin_open_minutes: 20, checkin_close_minutes: 10 } as Partial<SessionRow>) });
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy with message" }));
    const { open, close } = clockWindowPkt("2026-11-10T14:00:00.000Z", 20, 10);
    await waitFor(() => expect(h.write).toHaveBeenCalledWith(expect.stringContaining(`Attendance Open at ${open} and Closes at ${close} PKT.`)));
  });

  it("the attendance message falls back to the batch window", async () => {
    row({ batchWindow: { open: 20, close: 10 } });
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy with message" }));
    const { open, close } = clockWindowPkt("2026-11-10T14:00:00.000Z", 20, 10);
    await waitFor(() => expect(h.write).toHaveBeenCalledWith(expect.stringContaining(`Attendance Open at ${open} and Closes at ${close} PKT.`)));
  });

  it("shows a toast when the clipboard fails", async () => {
    h.write.mockRejectedValue(new Error("no"));
    row();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Could not copy. Select the link and copy it by hand."));
  });

  it("disables the feedback button with a note when there is no feedback link", () => {
    row({ c: cls({ feedbackLink: null }) });
    expect((screen.getByRole("button", { name: "Copy feedback link" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("This class has no feedback link yet")).toBeTruthy();
  });

  it("asks for an audience instead of sending when none is chosen", async () => {
    const onNeed = vi.fn();
    row({ s: session({ audience: null } as Partial<SessionRow>), onNeedAudience: onNeed });
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(onNeed).toHaveBeenCalled());
    expect(h.error).toHaveBeenCalledWith("Choose who gets this email first");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.sendReminderNow).not.toHaveBeenCalled();
    expect(h.resendClassDetails).not.toHaveBeenCalled();
  });

  it("confirms then sends the first time", async () => {
    row();
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.sendReminderNow).toHaveBeenCalledTimes(1));
    expect(h.confirm.mock.calls[0][0].title).toBe("Email the Zoom link now?");
    expect(h.resendClassDetails).not.toHaveBeenCalled();
  });

  it("sends again with the other wording when a reminder already went out", async () => {
    row({ sends: { reminderAt: "2026-11-10T06:00:00.000Z", updateAt: null } });
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.resendClassDetails).toHaveBeenCalledTimes(1));
    expect(h.confirm.mock.calls[0][0].title).toBe("Email students again?");
    expect(h.sendReminderNow).not.toHaveBeenCalled();
  });

  it("does not send when the confirm is declined", async () => {
    h.confirm.mockResolvedValue(false);
    row();
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.sendReminderNow).not.toHaveBeenCalled();
  });

  it("renders the reminder line for each tone", () => {
    const a = row();
    expect(screen.getByRole("status").textContent).toMatch(/Reminder will send/);
    expect(screen.getByRole("status").querySelector("[data-tone='ok']")).toBeTruthy();
    a.unmount();
    const b = row({ s: session({ audience: null } as Partial<SessionRow>) });
    expect(screen.getByRole("status").textContent).toBe("Choose who gets the reminder");
    expect(screen.getByRole("status").querySelector("[data-tone='warn']")).toBeTruthy();
    b.unmount();
    row({ s: session({ email_enabled: false }) });
    expect(screen.getByRole("status").textContent).toBe("Reminder is switched off");
    expect(screen.getByRole("status").querySelector("[data-tone='idle']")).toBeTruthy();
  });

  it("buttons are tall enough to tap", () => {
    row();
    for (const name of ["Copy attendance link", "Copy feedback link", "Send emails"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/min-h-12/);
    }
  });
});
