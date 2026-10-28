import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  addSession: vi.fn(),
  saveSession: vi.fn(),
  setOverride: vi.fn(),
  sendReminderNow: vi.fn(),
  emailUpdatedTime: vi.fn(),
  markEveryonePresent: vi.fn(),
  toggleMark: vi.fn(),
  saveMinPct: vi.fn(),
  removeSession: vi.fn(),
  createMissing: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: h.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  addSession: h.addSession,
  saveSession: h.saveSession,
  setOverride: h.setOverride,
  sendReminderNow: h.sendReminderNow,
  emailUpdatedTime: h.emailUpdatedTime,
  markEveryonePresent: h.markEveryonePresent,
  toggleMark: h.toggleMark,
  saveMinPct: h.saveMinPct,
  removeSession: h.removeSession,
}));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({
  createMissingFeedbackAction: h.createMissing,
}));

import { TodayPanel } from "@/components/admin/classes/TodayPanel";
import { EditClassDialog } from "@/components/admin/classes/EditClassDialog";
import { SessionsPanel } from "@/components/admin/attendance/SessionsPanel";
import type { ClassSummary, ClassOverview } from "@/lib/data/class-overview";
import type { SessionRow } from "@/lib/data/attendance";

const PAGE = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-11-10T07:00:00.000Z";

const summary = (over: Partial<ClassSummary> = {}): ClassSummary => ({
  id: "s1", number: 1, title: "Intro", speaker: "Dr A",
  startsAt: "2026-11-10T14:00:00.000Z", endsAt: "2026-11-10T16:00:00.000Z",
  status: "today", presentCount: 38, enrolledLive: 52,
  attendanceLink: "https://x.test/attend/code0001",
  feedbackLink: "https://x.test/feedback/slug-one", feedbackSessionId: "f1",
  feedbackCount: 0, feedbackAvg: null,
  quiz: { saved: false, players: 0, needCheck: 0 },
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

function panel(c: ClassSummary, s: SessionRow = session()) {
  return render(<TodayPanel pageId={PAGE} cls={c} session={s} rows={[]} minPct={75} sends={undefined} nowIso={NOW} />);
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.addSession.mockResolvedValue({ ok: true, message: "Session added" });
  h.saveSession.mockResolvedValue({ ok: true, message: "Session saved" });
  h.createMissing.mockResolvedValue({ ok: true, message: "Created 1 feedback form" });
});

describe("TodayPanel banner", () => {
  it("banner names the next step for each state", () => {
    const { unmount } = panel(summary({ status: "upcoming" }));
    expect(screen.getByRole("status").textContent).toMatch(/Share the attendance link with students/);
    unmount();

    const a = panel(summary());
    expect(screen.getByRole("status").textContent).toMatch(/Upload today's quiz results/);
    a.unmount();

    const b = panel(summary({ status: "done" }));
    expect(screen.getByRole("status").textContent).toMatch(/Upload this class's quiz results/);
    b.unmount();

    const c = panel(summary({ quiz: { saved: true, players: 54, needCheck: 3 } }));
    expect(screen.getByRole("status").textContent).toMatch(/Check feedback responses/);
    c.unmount();

    panel(summary({ quiz: { saved: true, players: 54, needCheck: 0 }, feedbackCount: 12, feedbackAvg: 4.5 }));
    expect(screen.getByRole("status").textContent).toMatch(/All done for this class/);
  });
});

describe("cards", () => {
  it("copy link button is first and email second on the attendance card, copy first on feedback", () => {
    panel(summary());
    const att = screen.getByTestId("attendance-card");
    const attButtons = within(att).getAllByRole("button");
    expect(attButtons[0].textContent).toMatch(/Copy link/);
    expect(attButtons[1].textContent).toMatch(/Email to students/);
    const fb = screen.getByTestId("feedback-card");
    expect(within(fb).getAllByRole("button")[0].textContent).toMatch(/Copy link/);
    expect(att.textContent).toMatch(/38\s*of 52 present/);
  });

  it("class with no feedback shows Create missing feedback links", async () => {
    panel(summary({ feedbackLink: null, feedbackSessionId: null }));
    const fb = screen.getByTestId("feedback-card");
    fireEvent.click(within(fb).getByRole("button", { name: "Create missing feedback links" }));
    await waitFor(() => expect(h.createMissing).toHaveBeenCalledWith(PAGE));
  });

  it("quiz card links to the upload screen, or to the results once saved", () => {
    const { unmount } = panel(summary());
    expect(screen.getByRole("link", { name: "Upload Kahoot file" }).getAttribute("href")).toMatch(/\/sessions\/s1\/quiz$/);
    unmount();
    panel(summary({ quiz: { saved: true, players: 54, needCheck: 3 } }));
    expect(screen.getByRole("link", { name: "Open quiz results" })).toBeTruthy();
    expect(screen.getByText("54 players, 3 need checking")).toBeTruthy();
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

describe("SessionsPanel", () => {
  const overview = (classes: ClassSummary[]): ClassOverview => ({ title: "Batch", classes, selectedId: classes[0]?.id ?? "" });

  it("shows a friendly empty state with a Set up classes button", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview([])} sessions={[]} rows={[]} minPct={75} sends={{}} nowIso={NOW} />);
    expect(screen.getByText("No classes yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set up classes" }).getAttribute("href")).toMatch(/\/sessions\/setup$/);
  });

  it("adding a class creates its feedback link afterwards", async () => {
    render(
      <SessionsPanel pageId={PAGE} overview={overview([summary()])} sessions={[session()]} rows={[]} minPct={75} sends={{}} nowIso={NOW} />,
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
});
