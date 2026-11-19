import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";

const h = vi.hoisted(() => ({
  addSession: vi.fn(),
  saveSession: vi.fn(),
  setOverride: vi.fn(),
  sendReminderNow: vi.fn(),
  emailUpdatedTime: vi.fn(),
  resendClassDetails: vi.fn(),
  sendTestEmailToMe: vi.fn(),
  emailMissingOnly: vi.fn(),
  emailNewZoomLink: vi.fn(),
  markEveryonePresent: vi.fn(),
  toggleMark: vi.fn(),
  saveMinPct: vi.fn(),
  removeSession: vi.fn(),
  createMissing: vi.fn(),
  emailFeedbackLink: vi.fn(),
  confirm: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  addSession: h.addSession,
  saveSession: h.saveSession,
  setOverride: h.setOverride,
  sendReminderNow: h.sendReminderNow,
  emailUpdatedTime: h.emailUpdatedTime,
  resendClassDetails: h.resendClassDetails,
  markEveryonePresent: h.markEveryonePresent,
  toggleMark: h.toggleMark,
  saveMinPct: h.saveMinPct,
  removeSession: h.removeSession,
  emailFeedbackLink: h.emailFeedbackLink,
  sendTestEmailToMe: h.sendTestEmailToMe,
  emailMissingOnly: h.emailMissingOnly,
  emailNewZoomLink: h.emailNewZoomLink,
  loadClassEmailHistory: vi.fn(async () => ({ ok: true, rounds: [] })),
}));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({
  createMissingFeedbackAction: h.createMissing,
}));

import { TodayPanel } from "@/components/admin/classes/TodayPanel";
import { EditClassDialog } from "@/components/admin/classes/EditClassDialog";
import { SessionsPanel } from "@/components/admin/attendance/SessionsPanel";
import type { ClassSummary, ClassOverview } from "@/lib/data/class-overview";
import type { SessionRow, GridRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import type { ClassTab } from "@/lib/classes/tabs";

const PAGE = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-11-10T07:00:00.000Z";

const summary = (over: Partial<ClassSummary> = {}): ClassSummary => ({
  id: "s1", number: 1, title: "Intro", speaker: "Dr A",
  startsAt: "2026-11-10T14:00:00.000Z", endsAt: "2026-11-10T16:00:00.000Z",
  status: "today", presentCount: 38, enrolledLive: 52,
  attendanceLink: "https://x.test/attend/code0001",
  feedbackLink: "https://x.test/feedback/slug-one", feedbackSessionId: "f1",
  feedbackCount: 0, feedbackAvg: null,
  quiz: { saved: false, players: 0 },
  ...over,
});
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1", page_id: PAGE, number: 1, title: "Intro", speaker: "Dr A",
  starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z",
  zoom_url: "https://zoom.us/j/1", kahoot_url: "", include_kahoot: false, include_attendance_link: true,
  email_enabled: true, email_lead_minutes: 60, public_code: "code0001", window_override: "auto",
  custom_time: false, custom_zoom: false, feedback_session_id: "f1",
  quiz_file_name: null, quiz_max_score: null, quiz_saved_at: null, created_at: null,
  ...over,
} as SessionRow);

function Harness({ c, s, extra }: { c: ClassSummary; s: SessionRow; extra: { rows?: GridRow[]; sends?: SessionSendState; tab?: ClassTab } }) {
  const [tab, setTab] = useState<ClassTab>(extra.tab ?? "links");
  return <TodayPanel pageId={PAGE} cls={c} session={s} rows={extra.rows ?? []} minPct={75} sends={extra.sends} nowIso={NOW} tab={tab} onTabChange={setTab} />;
}
function panel(c: ClassSummary, s: SessionRow = session(), extra: { rows?: GridRow[]; sends?: SessionSendState; tab?: ClassTab } = {}) {
  return render(<Harness c={c} s={s} extra={extra} />);
}
/** The same panel opened on the Attendance tab. */
function attPanel(c: ClassSummary, s: SessionRow = session(), extra: { rows?: GridRow[]; sends?: SessionSendState } = {}) {
  return panel(c, s, { ...extra, tab: "attendance" });
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.confirm.mockResolvedValue(true);
  h.addSession.mockResolvedValue({ ok: true, message: "Class added" });
  h.saveSession.mockResolvedValue({ ok: true, message: "Class saved" });
  h.sendReminderNow.mockResolvedValue({ ok: true, message: "Email sent to 5 people" });
  h.resendClassDetails.mockResolvedValue({ ok: true, message: "Email sent to 5 people" });
  h.emailUpdatedTime.mockResolvedValue({ ok: true });
  h.toggleMark.mockResolvedValue({ ok: true });
  h.markEveryonePresent.mockResolvedValue({ ok: true, message: "3 students marked present" });
  h.createMissing.mockResolvedValue({ ok: true, message: "Created 1 feedback form" });
});

describe("TodayPanel banner", () => {
  it("banner names the next step for each state", () => {
    const { unmount } = panel(summary({ status: "upcoming" }));
    expect(screen.getByRole("status", { name: "Next step" }).textContent).toMatch(/Share the attendance link with students/);
    unmount();

    const a = panel(summary());
    expect(screen.getByRole("status", { name: "Next step" }).textContent).toMatch(/Upload today's quiz results/);
    a.unmount();

    const b = panel(summary({ status: "done" }));
    expect(screen.getByRole("status", { name: "Next step" }).textContent).toMatch(/Upload this class's quiz results/);
    b.unmount();

    const c = panel(summary({ quiz: { saved: true, players: 54 } }));
    expect(screen.getByRole("status", { name: "Next step" }).textContent).toMatch(/Check feedback responses/);
    c.unmount();

    panel(summary({ quiz: { saved: true, players: 54 }, feedbackCount: 12, feedbackAvg: 4.5 }));
    expect(screen.getByRole("status", { name: "Next step" }).textContent).toMatch(/All done for this class/);
  });
});

describe("cards", () => {
  it("the attendance tab shows the present count", () => {
    attPanel(summary());
    expect(screen.getByTestId("attendance-card").textContent).toMatch(/38\s*of 52 present/);
  });

  it("the feedback box on the Links tab shows Email to students and See responses", () => {
    panel(summary());
    const fb = screen.getByTestId("feedback-card");
    expect(within(fb).getByRole("button", { name: "Email to students" })).toBeTruthy();
    expect(within(fb).getByRole("link", { name: "See responses" })).toBeTruthy();
  });

  it("email button confirms before sending", async () => {
    h.emailFeedbackLink.mockResolvedValue({ ok: true, message: "Email sent to 52 students" });
    panel(summary());
    fireEvent.click(within(screen.getByTestId("feedback-card")).getByRole("button", { name: /Email to students/ }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({
      description: "Send the feedback link by email to all enrolled students?",
    })));
    await waitFor(() => expect(h.emailFeedbackLink).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(h.success).toHaveBeenCalledWith("Email sent to 52 students"));
  });

  it("does not send when the confirm is declined", async () => {
    h.confirm.mockResolvedValue(false);
    panel(summary());
    fireEvent.click(within(screen.getByTestId("feedback-card")).getByRole("button", { name: /Email to students/ }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.emailFeedbackLink).not.toHaveBeenCalled();
  });

  it("no email button when the class has no feedback link", () => {
    panel(summary({ feedbackLink: null, feedbackSessionId: null }));
    expect(screen.queryByRole("button", { name: /Email to students/ })).toBeNull();
  });

  it("class with no feedback shows Create missing feedback links", async () => {
    panel(summary({ feedbackLink: null, feedbackSessionId: null }));
    fireEvent.click(screen.getByRole("button", { name: "Create missing feedback links" }));
    await waitFor(() => expect(h.createMissing).toHaveBeenCalledWith(PAGE));
  });

  it("quiz card links to the upload screen, or to the results once saved", () => {
    const { unmount } = panel(summary(), session(), { tab: "quiz" });
    expect(screen.getByRole("link", { name: "Upload Kahoot file" }).getAttribute("href")).toMatch(/\/sessions\/s1\/quiz$/);
    unmount();
    const b = panel(summary({ quiz: { saved: true, players: 54 } }), session(), { tab: "quiz" });
    expect(screen.getByRole("link", { name: "Open quiz results" })).toBeTruthy();
    expect(screen.getByText("54 players")).toBeTruthy();
    b.unmount();
    panel(summary({ quiz: { saved: true, players: 54 } }));
    expect(screen.getByRole("link", { name: "See responses" }).getAttribute("href")).toBe("/dashboard/admin/feedback/f1");
  });
});

describe("EditClassDialog", () => {
  it("a changed time on a class that follows the defaults sends customTime and a matching end", async () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "20:00" } });
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.saveSession).toHaveBeenCalledTimes(1));
    const [id, form] = h.saveSession.mock.calls[0];
    expect(id).toBe("s1");
    expect(form.customTime).toBe(true);
    expect(form.customZoom).toBe(false);
    expect(form.startsAtLocal).toBe("2026-11-10T20:00");
    expect(form.endsAtLocal).toBe("2026-11-10T22:00");
    expect(form.speaker).toBe("Dr A");
  });

  it("an untouched time keeps following the defaults", async () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "New topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.saveSession).toHaveBeenCalled());
    expect(h.saveSession.mock.calls[0][1].customTime).toBe(false);
    expect(h.saveSession.mock.calls[0][1].endsAtLocal).toBe("2026-11-10T21:00");
  });
});

describe("EditClassDialog stacking", () => {
  it("sits above the mobile bottom nav and clears it", () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    expect(overlay.className).toContain("z-[60]");
    expect(overlay.className).toContain("pb-[calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(overlay.className).toContain("lg:pb-4");
  });
});

describe("EditClassDialog rules", () => {
  it("moving only the start moves the end by the same amount", async () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "20:30" } });
    expect((screen.getByLabelText("Ends at") as HTMLInputElement).value).toBe("22:30");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.saveSession).toHaveBeenCalled());
    expect(h.saveSession.mock.calls[0][1].endsAtLocal).toBe("2026-11-10T22:30");
    expect(h.saveSession.mock.calls[0][1].customTime).toBe(true);
  });

  it("an end typed by the admin is not moved by a later start change", () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "23:00" } });
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "20:00" } });
    expect((screen.getByLabelText("Ends at") as HTMLInputElement).value).toBe("23:00");
  });

  it("blocks saving when the end is not after the start", () => {
    render(<EditClassDialog pageId={PAGE} session={session()} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(h.error).toHaveBeenCalledWith("The class must end after it starts");
    expect(h.saveSession).not.toHaveBeenCalled();
  });

  it("Kahoot link and both email flags go through saveSession", async () => {
    render(<EditClassDialog pageId={PAGE} session={session({ kahoot_url: "https://kahoot.it/old" })} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Kahoot link (optional)"), { target: { value: "https://kahoot.it/new" } });
    fireEvent.click(screen.getByLabelText("Put the Kahoot link in the class email"));
    fireEvent.click(screen.getByLabelText("Put the attendance link in the class email"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.saveSession).toHaveBeenCalled());
    const form = h.saveSession.mock.calls[0][1];
    expect(form.kahootUrl).toBe("https://kahoot.it/new");
    expect(form.includeKahoot).toBe(true);
    expect(form.includeAttendanceLink).toBe(false);
  });

  it("a new class starts with the attendance link on and Kahoot off, and can change them", async () => {
    const ref = session({ include_kahoot: true, include_attendance_link: false, kahoot_url: "https://kahoot.it/x" });
    render(<EditClassDialog pageId={PAGE} reference={ref} nextNumber={2} onClose={vi.fn()} />);
    expect((screen.getByLabelText("Put the attendance link in the class email") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Put the Kahoot link in the class email") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Put the Kahoot link in the class email"));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    await waitFor(() => expect(h.addSession).toHaveBeenCalled());
    expect(h.addSession.mock.calls[0][1].includeKahoot).toBe(true);
    expect(h.addSession.mock.calls[0][1].includeAttendanceLink).toBe(true);
  });

  it("a new class copied from a reference that follows the defaults stays non-custom unless time or zoom changed", async () => {
    const ref = session({ custom_time: false, custom_zoom: false });
    const { unmount } = render(<EditClassDialog pageId={PAGE} reference={ref} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(1));
    expect(h.addSession.mock.calls[0][1].customTime).toBe(false);
    expect(h.addSession.mock.calls[0][1].customZoom).toBe(false);
    unmount();

    render(<EditClassDialog pageId={PAGE} reference={ref} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.change(screen.getByLabelText("Zoom link"), { target: { value: "https://zoom.us/j/9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(2));
    expect(h.addSession.mock.calls[1][1].customZoom).toBe(true);
    expect(h.addSession.mock.calls[1][1].customTime).toBe(false);
  });

  it("when the only reference is customised, the copied time and zoom are saved as custom", async () => {
    const ref = session({ custom_time: true, custom_zoom: true });
    render(<EditClassDialog pageId={PAGE} reference={ref} nextNumber={2} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(1));
    expect(h.addSession.mock.calls[0][1].customTime).toBe(true);
    expect(h.addSession.mock.calls[0][1].customZoom).toBe(true);
  });
});

const AUD = { audience: { mode: "live", modules: "all" } } as Partial<SessionRow>;
describe("class email actions", () => {
  it("first send uses the reminder; a second send asks and then re-sends the plain class details", async () => {
    const { unmount } = panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.sendReminderNow).toHaveBeenCalledWith("s1"));
    expect(h.resendClassDetails).not.toHaveBeenCalled();
    unmount();

    panel(summary(), session(AUD), { sends: { reminderAt: "2026-11-09T10:00:00.000Z", updateAt: null } });
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.resendClassDetails).toHaveBeenCalledWith("s1"));
    expect(h.emailUpdatedTime).not.toHaveBeenCalled();
  });

  it("asks before the first real send and sends nothing when you say no", async () => {
    h.confirm.mockResolvedValueOnce(false);
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm.mock.calls[0][0].description).toMatch(/test/i);
    expect(h.sendReminderNow).not.toHaveBeenCalled();
  });

  it("Email people who have not got it asks, then sends only to them", async () => {
    h.emailMissingOnly.mockResolvedValue({ ok: true, message: "Email sent to 3 people" });
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: /haven.t got it/ }));
    await waitFor(() => expect(h.emailMissingOnly).toHaveBeenCalledWith("s1"));
    expect(h.sendReminderNow).not.toHaveBeenCalled();
    expect(h.resendClassDetails).not.toHaveBeenCalled();
  });

  it("saying no to the only-missing question sends nothing", async () => {
    h.confirm.mockResolvedValueOnce(false);
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: /haven.t got it/ }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.emailMissingOnly).not.toHaveBeenCalled();
  });

  it("the repeat send warns that people who already got it get it again", async () => {
    panel(summary(), session(AUD), { sends: { reminderAt: "2026-11-09T10:00:00.000Z", updateAt: null } });
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm.mock.calls[0][0].description).toMatch(/already got it/);
  });

  it("after only a time-change email the main button also warns that people already got it", async () => {
    panel(summary(), session(AUD), { sends: { reminderAt: null, updateAt: "2026-11-09T10:00:00.000Z" } });
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm.mock.calls[0][0].description).toMatch(/already got it/);
  });

  it("Email new Zoom link under More settings asks first, then sends the changed-link email", async () => {
    h.emailNewZoomLink.mockResolvedValue({ ok: true, message: "Email sent to 3 people" });
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: "Email new Zoom link" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm.mock.calls[0][0].description).toMatch(/everyone/i);
    await waitFor(() => expect(h.emailNewZoomLink).toHaveBeenCalledWith("s1"));
  });

  it("Send me a test sends a test copy without asking", async () => {
    h.sendTestEmailToMe.mockResolvedValue({ ok: true, message: "Test email sent to a@b.c" });
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: /Send me a test/ }));
    await waitFor(() => expect(h.sendTestEmailToMe).toHaveBeenCalledWith("s1"));
    expect(h.sendReminderNow).not.toHaveBeenCalled();
  });

  it("Email updated time under More settings keeps the updated-time email", async () => {
    panel(summary(), session(AUD));
    fireEvent.click(screen.getByRole("button", { name: "Email updated time" }));
    await waitFor(() => expect(h.emailUpdatedTime).toHaveBeenCalledWith("s1"));
  });

  it("shows when the reminder and the time change email went out", () => {
    panel(summary(), session(AUD), { sends: { reminderAt: "2026-11-09T10:00:00.000Z", updateAt: "2026-11-09T12:00:00.000Z" } });
    const att = screen.getByRole("tabpanel");
    expect(att.textContent).toMatch(/Reminder email sent .*Class details email sent/);
  });

  it("shows when no reminder has gone out yet", () => {
    panel(summary(), session({ audience: { mode: "live", modules: "all" } } as Partial<SessionRow>));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Reminder email not sent yet/);
  });

  it("Mark everyone present marks the selected class", async () => {
    attPanel(summary());
    fireEvent.click(screen.getByRole("button", { name: "Mark everyone present" }));
    await waitFor(() => expect(h.markEveryonePresent).toHaveBeenCalledWith("s1"));
  });

  it("the attendance list taps one student for this class", () => {
    const row: GridRow = { personId: "p1", pzId: "PZ-1", name: "Ayesha Khan", marks: {}, started: 1, marked: 0, pct: 0, meetsMin: false };
    attPanel(summary(), session(), { rows: [row] });
    fireEvent.click(screen.getByRole("button", { name: /Ayesha Khan/ }));
    expect(h.toggleMark).toHaveBeenCalledWith("s1", "p1", true);
  });
});

describe("SessionsPanel", () => {
  const overview = (classes: ClassSummary[]): ClassOverview => ({
    title: "Batch", slug: "batch", classes, selectedId: classes[0]?.id ?? "",
    batchFeedback: { totalResponses: 0, overallAvg: null, perClass: [] }, programId: null,
  });

  it("shows a friendly empty state with a Set up classes button", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview([])} sessions={[]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    expect(screen.getByText("No classes yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set up classes" }).getAttribute("href")).toMatch(/\/sessions\/setup$/);
    expect((screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement).checked).toBe(true);
  });

  it("adding a class creates its feedback link afterwards", async () => {
    render(
      <SessionsPanel pageId={PAGE} overview={overview([summary()])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />,
    );
    expect(screen.getByRole("link", { name: "Edit all classes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a class" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add class" }));
    await waitFor(() => expect(h.addSession).toHaveBeenCalledTimes(1));
    expect(h.addSession.mock.calls[0][1].number).toBe(2);
    await waitFor(() => expect(h.createMissing).toHaveBeenCalledWith(PAGE));
  });

  it("shows the portal switch with its effective state (draft + automatic is off, published + automatic is on)", () => {
    const { unmount } = render(
      <SessionsPanel pageId={PAGE} overview={overview([summary()])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="draft" showInPortal={null} />,
    );
    expect((screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/still a draft/)).toBeTruthy();
    unmount();
    render(
      <SessionsPanel pageId={PAGE} overview={overview([summary()])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />,
    );
    expect((screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement).checked).toBe(true);
  });
});

describe("phone-first Classes screen", () => {
  const overview2 = (classes: ClassSummary[]): ClassOverview => ({
    title: "Batch", slug: "batch", classes, selectedId: classes[0]?.id ?? "",
    batchFeedback: { totalResponses: 0, overallAvg: null, perClass: [] }, programId: null,
  });

  it("next step has one big button: a link to the quiz page when the quiz is missing", () => {
    panel(summary());
    const box = screen.getByRole("status", { name: "Next step" });
    const link = within(box).getByRole("link", { name: "Upload quiz results" });
    expect(link.getAttribute("href")).toMatch(/\/sessions\/s1\/quiz$/);
  });

  it("for an upcoming class the button shows the links on the Links tab", () => {
    panel(summary({ status: "upcoming" }), session(), { tab: "attendance" });
    expect(screen.getByRole("tab", { name: "Attendance" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(screen.getByRole("status", { name: "Next step" })).getByRole("button", { name: "Show attendance link" }));
    expect(screen.getByRole("tab", { name: "Links and emails" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("group", { name: "Attendance link" })).toBeTruthy();
  });

  it("only the open tab's panel is on the page", () => {
    panel(summary({ quiz: { saved: true, players: 5 } }), session(), { tab: "quiz" });
    expect(screen.getByTestId("quiz-card")).toBeTruthy();
    expect(screen.queryByTestId("attendance-card")).toBeNull();
    expect(screen.queryByTestId("feedback-card")).toBeNull();
  });

  it("no next-step button when everything is done", () => {
    panel(summary({ quiz: { saved: true, players: 54 }, feedbackCount: 12, feedbackAvg: 4.5 }));
    const box = screen.getByRole("status", { name: "Next step" });
    expect(within(box).queryByRole("button")).toBeNull();
    expect(within(box).queryByRole("link")).toBeNull();
  });

  it("each tab shows its one-line status", () => {
    panel(summary({ feedbackCount: 18, feedbackAvg: 4.6 }));
    expect(screen.getByRole("tab", { name: "Attendance" }).textContent).toContain("38 of 52 present");
    expect(screen.getByRole("tab", { name: "Quiz and podium" }).textContent).toContain("Not uploaded yet");
  });

  it("the day list scrolls sideways on a phone", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview2([summary(), summary({ id: "s2", number: 2 })])} sessions={[session(), session({ id: "s2", number: 2 })]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    const strip = screen.getByRole("button", { name: /Day 2/ }).closest("ul")!;
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).toMatch(/\bflex\b/);
  });

  it("one Batch settings fold holds the pass mark and the portal switch", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview2([summary()])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    const folds = screen.getAllByText("Batch settings");
    expect(folds).toHaveLength(1);
    const details = folds[0].closest("details")!;
    expect(within(details).getByLabelText(/Minimum attendance to pass/)).toBeTruthy();
    expect(within(details).getByLabelText(/Show on public progress portal/)).toBeTruthy();
  });

  it("the page grid cannot be stretched by the day strip (single shrinkable column on a phone)", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview2([summary(), summary({ id: "s2", number: 2 })])} sessions={[session(), session({ id: "s2", number: 2 })]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    const grid = screen.getByRole("button", { name: /Day 2/ }).closest("div.grid")!;
    expect(grid.className).toContain("grid-cols-1");
  });

  it("each day chip has a status dot", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview2([summary({ status: "done" })])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    const chip = screen.getByRole("button", { name: /Day 1/ });
    expect(chip.querySelector("span[aria-hidden='true'].rounded-full")!.className).toContain("bg-emerald-600");
  });

  it("the next-step button scrolls the Links panel into view, every time", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    panel(summary({ status: "upcoming" }), session(), { tab: "attendance" });
    fireEvent.click(within(screen.getByRole("status", { name: "Next step" })).getByRole("button", { name: "Show attendance link" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect((scroll.mock.instances[0] as HTMLElement).id).toBe("class-panel-links");
    scroll.mockClear();
    fireEvent.click(within(screen.getByRole("status", { name: "Next step" })).getByRole("button", { name: "Show attendance link" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it("Edit all classes and Add a class are above the day strip, so they are found without scrolling past every class", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview2([summary(), summary({ id: "s2", number: 2 })])} sessions={[session(), session({ id: "s2", number: 2 })]} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />);
    const edit = screen.getByRole("link", { name: "Edit all classes" });
    const add = screen.getByRole("button", { name: "Add a class" });
    const day2 = screen.getByRole("button", { name: /Day 2/ });
    expect(edit.compareDocumentPosition(day2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.compareDocumentPosition(day2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
