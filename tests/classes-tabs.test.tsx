import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
  confirm: vi.fn(),
  sendReminderNow: vi.fn(),
  sendTestEmailToMe: vi.fn(),
  emailMissingOnly: vi.fn(),
  emailFeedbackLink: vi.fn(),
  createMissing: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: h.replace }),
  useSearchParams: () => h.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  addSession: vi.fn(), saveSession: vi.fn(), setOverride: vi.fn(), resendClassDetails: vi.fn(), emailUpdatedTime: vi.fn(),
  markEveryonePresent: vi.fn(), toggleMark: vi.fn(), saveMinPct: vi.fn(), removeSession: vi.fn(), emailNewZoomLink: vi.fn(),
  sendReminderNow: h.sendReminderNow,
  sendTestEmailToMe: h.sendTestEmailToMe,
  emailMissingOnly: h.emailMissingOnly,
  emailFeedbackLink: h.emailFeedbackLink,
  previewClassAudience: vi.fn(async () => ({ ok: true })),
  saveClassAudience: vi.fn(),
  loadClassEmailHistory: vi.fn(async () => ({ ok: true, rounds: [] })),
}));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({
  createMissingFeedbackAction: h.createMissing,
}));

import { ClassTabs } from "@/components/admin/classes/ClassTabs";
import { SessionsPanel } from "@/components/admin/attendance/SessionsPanel";
import { classPanelId, type ClassTab } from "@/lib/classes/tabs";
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
  feedbackCount: 0, feedbackAvg: null, quiz: { saved: false, players: 0 },
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
const overview = (classes: ClassSummary[], selectedId = classes[0]?.id ?? ""): ClassOverview => ({
  title: "Batch", slug: "batch", classes, selectedId,
  batchFeedback: { totalResponses: 0, overallAvg: null, perClass: [] }, programId: null,
});

beforeEach(() => {
  h.replace.mockReset();
  h.confirm.mockReset().mockResolvedValue(true);
  h.sendReminderNow.mockReset();
  h.sendTestEmailToMe.mockReset().mockResolvedValue({ ok: true });
  h.emailMissingOnly.mockReset().mockResolvedValue({ ok: true });
  h.emailFeedbackLink.mockReset().mockResolvedValue({ ok: true });
  h.createMissing.mockReset().mockResolvedValue({ ok: true });
  h.params = new URLSearchParams();
});

function Harness({ start = "links", onChange }: { start?: ClassTab; onChange?: (t: ClassTab) => void }) {
  const [tab, setTab] = useState<ClassTab>(start);
  return (
    <ClassTabs active={tab} onChange={(t) => { setTab(t); onChange?.(t); }} panelId={classPanelId} counts={{ attendance: "38 of 52" }} />
  );
}

describe("ClassTabs", () => {
  it("renders a tablist with three tabs wired to their panels", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist");
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Links and emails", "Attendance", "Quiz and podium"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[1].getAttribute("aria-controls")).toBe(classPanelId("attendance"));
    expect(tabs[0].className).toContain("min-h-12");
    expect(list.parentElement!.className).toContain("sticky");
    expect(list.parentElement!.className).toContain("top-16");
  });

  it("clicking a tab calls onChange", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Quiz and podium" }));
    expect(onChange).toHaveBeenCalledWith("quiz");
  });

  it("arrow keys move and activate, wrapping round, and move focus", () => {
    render(<Harness />);
    const tab = (n: string) => screen.getByRole("tab", { name: n });
    fireEvent.keyDown(tab("Links and emails"), { key: "ArrowRight" });
    expect(tab("Attendance").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Attendance"));
    fireEvent.keyDown(tab("Attendance"), { key: "ArrowLeft" });
    fireEvent.keyDown(tab("Links and emails"), { key: "ArrowLeft" });
    expect(tab("Quiz and podium").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tab("Quiz and podium"), { key: "ArrowRight" });
    expect(tab("Links and emails").getAttribute("aria-selected")).toBe("true");
  });

  it("Home and End jump to the first and last tab", () => {
    render(<Harness start="attendance" />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Attendance" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Quiz and podium" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Quiz and podium" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Links and emails" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a short label below md and the full label from md up", () => {
    render(<Harness />);
    const t = screen.getByRole("tab", { name: "Quiz and podium" });
    expect(t.querySelector(".md\\:hidden")!.textContent).toBe("Quiz");
    expect(t.querySelector("span.hidden")!.textContent).toBe("Quiz and podium");
  });
});

function panel(classes: ClassSummary[], sessions: SessionRow[], selectedId?: string) {
  return render(
    <SessionsPanel pageId={PAGE} overview={overview(classes, selectedId)} sessions={sessions} rows={[]} minPct={75} sends={{}} nowIso={NOW} pageStatus="published" showInPortal={null} />,
  );
}
const two = () =>
  panel(
    [summary(), summary({ id: "s2", number: 2, attendanceLink: "https://x.test/attend/code0002" })],
    [session(), session({ id: "s2", number: 2 })],
  );

describe("SessionsPanel tab and class in the address", () => {
  it("starts on Links, with the panel wired to its tab", () => {
    two();
    expect(screen.getByRole("tab", { name: "Links and emails" }).getAttribute("aria-selected")).toBe("true");
    const p = screen.getByRole("tabpanel");
    expect(p.id).toBe(classPanelId("links"));
    expect(p.getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Links and emails" }).id);
    expect(within(p).getByTestId("feedback-card")).toBeTruthy();
  });

  it("?tab=attendance opens Attendance", () => {
    h.params = new URLSearchParams("tab=attendance");
    two();
    expect(screen.getByRole("tab", { name: "Attendance" }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getByTestId("attendance-card")).toBeTruthy();
  });

  it("?tab=quiz opens Quiz and podium", () => {
    h.params = new URLSearchParams("tab=quiz");
    two();
    expect(within(screen.getByRole("tabpanel")).getByTestId("quiz-card")).toBeTruthy();
  });

  it("?tab=bogus falls back to Links", () => {
    h.params = new URLSearchParams("tab=bogus");
    two();
    expect(screen.getByRole("tab", { name: "Links and emails" }).getAttribute("aria-selected")).toBe("true");
  });

  it("?class=<id> opens that class, an unknown class falls back to the default", () => {
    h.params = new URLSearchParams("class=s2");
    const a = two();
    expect(screen.getByText(/^Day 2 ·/)).toBeTruthy();
    a.unmount();
    h.params = new URLSearchParams("class=nope");
    two();
    expect(screen.getByText(/^Day 1 ·/)).toBeTruthy();
  });

  it("changing the tab writes both keys to the address without scrolling", () => {
    two();
    fireEvent.click(screen.getByRole("tab", { name: "Attendance" }));
    expect(h.replace).toHaveBeenCalledWith("?class=s1&tab=attendance", { scroll: false });
  });

  it("picking another class keeps the tab and writes both keys", () => {
    h.params = new URLSearchParams("tab=quiz");
    two();
    fireEvent.click(screen.getByRole("button", { name: /Day 2/ }));
    expect(h.replace).toHaveBeenCalledWith("?class=s2&tab=quiz", { scroll: false });
    expect(screen.getByRole("tab", { name: "Quiz and podium" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/^Day 2 ·/)).toBeTruthy();
  });

  it("Send emails before an audience is chosen switches to Links and focuses the audience box", async () => {
    h.params = new URLSearchParams("tab=quiz");
    panel([summary()], [session({ audience: null } as Partial<SessionRow>)]);
    expect(screen.queryByTestId("audience-picker")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send emails" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Links and emails" }).getAttribute("aria-selected")).toBe("true"));
    const box = document.getElementById("class-audience")!;
    expect(box.querySelector("[data-testid='audience-picker']")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(box.querySelector("[role='radio']")));
    expect(h.sendReminderNow).not.toHaveBeenCalled();
  });
});

describe("Links and emails tab keeps every email and feedback action", () => {
  const links = () => within(screen.getByRole("tabpanel"));

  it("shows the attendance and feedback link boxes side by side, each with Copy", () => {
    two();
    const att = links().getByRole("group", { name: "Attendance link" });
    expect(within(att).getByText("https://x.test/attend/code0001")).toBeTruthy();
    expect(within(att).getByRole("button", { name: "Copy link" })).toBeTruthy();
    const fb = links().getByRole("group", { name: "Feedback link" });
    expect(within(fb).getByText("https://x.test/feedback/slug-one")).toBeTruthy();
    expect(att.parentElement!.className).toContain("md:grid-cols-2");
  });

  it("Send me a test sends a test with no question", async () => {
    two();
    fireEvent.click(links().getByRole("button", { name: /Send me a test/ }));
    await waitFor(() => expect(h.sendTestEmailToMe).toHaveBeenCalledWith("s1"));
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("Email only those who have not got it asks first", async () => {
    two();
    fireEvent.click(links().getByRole("button", { name: /haven.t got it/ }));
    await waitFor(() => expect(h.emailMissingOnly).toHaveBeenCalledWith("s1"));
    expect(h.confirm).toHaveBeenCalled();
  });

  it("Email new Zoom link and Email updated time are here", () => {
    two();
    expect(links().getByRole("button", { name: "Email new Zoom link" })).toBeTruthy();
    expect(links().getByRole("button", { name: "Email updated time" })).toBeTruthy();
  });

  it("Email to students (feedback) asks, then sends", async () => {
    two();
    fireEvent.click(links().getByRole("button", { name: "Email to students" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ description: "Send the feedback link by email to all enrolled students?" })));
    await waitFor(() => expect(h.emailFeedbackLink).toHaveBeenCalledWith("s1"));
  });

  it("shows the response count and See responses", () => {
    panel([summary({ feedbackCount: 2, feedbackAvg: 4.5 })], [session()]);
    expect(links().getByText("2 responses")).toBeTruthy();
    expect(links().getByRole("link", { name: "See responses" }).getAttribute("href")).toBe("/dashboard/admin/feedback/f1");
  });

  it("without a feedback link it offers Create missing feedback links", async () => {
    panel([summary({ feedbackLink: null, feedbackSessionId: null })], [session()]);
    expect(links().queryByRole("button", { name: "Email to students" })).toBeNull();
    fireEvent.click(links().getByRole("button", { name: "Create missing feedback links" }));
    await waitFor(() => expect(h.createMissing).toHaveBeenCalledWith(PAGE));
  });
});
