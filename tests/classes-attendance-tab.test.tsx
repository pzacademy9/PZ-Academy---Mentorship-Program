import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  toggleMark: vi.fn(),
  markEveryonePresent: vi.fn(),
  setOverride: vi.fn(),
  saveMinPct: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  toggleMark: h.toggleMark,
  markEveryonePresent: h.markEveryonePresent,
  setOverride: h.setOverride,
  saveMinPct: h.saveMinPct,
}));

import { AttendanceTab } from "@/components/admin/classes/AttendanceTab";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionRow, GridRow } from "@/lib/data/attendance";

const NOW = "2026-11-10T07:00:00.000Z";
const cls = {
  id: "s1", number: 1, title: "Intro", speaker: "", startsAt: "2026-11-10T14:00:00.000Z", endsAt: null,
  status: "today", presentCount: 1, enrolledLive: 3, attendanceLink: "x", feedbackLink: null, feedbackSessionId: null,
  feedbackCount: 0, feedbackAvg: null, quiz: { saved: false, players: 0 },
} as unknown as ClassSummary;
const session = (over: Partial<SessionRow> = {}) =>
  ({ id: "s1", page_id: "pg", number: 1, starts_at: "2026-11-10T14:00:00.000Z", window_override: "auto", ...over }) as SessionRow;
const row = (personId: string, name: string, pzId: string, on = false): GridRow =>
  ({ personId, pzId, name, marks: on ? { s1: true } : {}, started: 1, marked: on ? 1 : 0, pct: 0, meetsMin: false }) as GridRow;
const ROWS = [row("p1", "Ayesha Khan", "Ayesha-1111"), row("p2", "Bilal Ahmed", "Bilal-2222", true), row("p3", "Chen Wei", "Chen-3333")];

function setup(rows = ROWS, s = session()) {
  return render(<AttendanceTab cls={cls} session={s} rows={rows} nowIso={NOW} />);
}
const list = () => screen.getAllByRole("button", { name: /, (present|not marked)$/ });

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.confirm.mockResolvedValue(true);
  h.toggleMark.mockResolvedValue({ ok: true });
  h.markEveryonePresent.mockResolvedValue({ ok: true, message: "2 students marked present" });
  h.setOverride.mockResolvedValue({ ok: true });
});

describe("AttendanceTab", () => {
  it("shows the present count", () => {
    setup();
    expect(screen.getByTestId("attendance-card").textContent).toMatch(/1\s*of 3 present/);
  });

  it("the search box has a label, is a search input and is 48px tall", () => {
    setup();
    const box = screen.getByLabelText("Search by name or ID");
    expect(box.getAttribute("type")).toBe("search");
    expect(box.className).toMatch(/min-h-12/);
  });

  it("filters by name and by PZ ID, and clearing restores all", () => {
    setup();
    const box = screen.getByLabelText("Search by name or ID");
    expect(list()).toHaveLength(3);
    fireEvent.change(box, { target: { value: "bilal" } });
    expect(list()).toHaveLength(1);
    fireEvent.change(box, { target: { value: "chen-33" } });
    expect(list()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Chen Wei/ })).toBeTruthy();
    fireEvent.change(box, { target: { value: "" } });
    expect(list()).toHaveLength(3);
  });

  it("says so when no student matches", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Search by name or ID"), { target: { value: "zzz" } });
    expect(screen.getByText("No student matches that search.")).toBeTruthy();
  });

  it("the list scrolls inside its own box", () => {
    setup();
    expect(screen.getByTestId("attendance-list").className).toMatch(/max-h-\[60vh\].*overflow-y-auto|overflow-y-auto.*max-h-\[60vh\]/);
  });

  it("tapping a row marks present and flips aria-pressed", async () => {
    setup();
    const btn = screen.getByRole("button", { name: /Ayesha Khan/ });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(h.toggleMark).toHaveBeenCalledWith("s1", "p1", true));
  });

  it("a present row is turned off with false", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Bilal Ahmed/ }));
    await waitFor(() => expect(h.toggleMark).toHaveBeenCalledWith("s1", "p2", false));
  });

  it("reverts with a toast when the save fails", async () => {
    h.toggleMark.mockResolvedValue({ ok: false, message: "Could not save" });
    setup();
    const btn = screen.getByRole("button", { name: /Ayesha Khan/ });
    fireEvent.click(btn);
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Could not save"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Ayesha Khan/ }).getAttribute("aria-pressed")).toBe("false"));
  });

  it("a mark made under a filter keeps its state after the filter changes", () => {
    setup();
    const box = screen.getByLabelText("Search by name or ID");
    fireEvent.change(box, { target: { value: "ayesha" } });
    fireEvent.click(screen.getByRole("button", { name: /Ayesha Khan/ }));
    fireEvent.change(box, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Ayesha Khan/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Mark everyone present asks first, then calls the action", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mark everyone present" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    await waitFor(() => expect(h.markEveryonePresent).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Ayesha Khan/ }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("saying no to Mark everyone present does nothing", async () => {
    h.confirm.mockResolvedValue(false);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mark everyone present" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.markEveryonePresent).not.toHaveBeenCalled();
  });

  it("check-in buttons call setOverride with auto, open and closed", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Force open" }));
    await waitFor(() => expect(h.setOverride).toHaveBeenCalledWith("s1", "open"));
    fireEvent.click(screen.getByRole("button", { name: "Force closed" }));
    await waitFor(() => expect(h.setOverride).toHaveBeenCalledWith("s1", "closed"));
    fireEvent.click(screen.getByRole("button", { name: "Automatic" }));
    await waitFor(() => expect(h.setOverride).toHaveBeenCalledWith("s1", "auto"));
    expect(screen.getByText(/Automatic: opens 15 minutes before/)).toBeTruthy();
  });

  it("has no email controls (they live on the Links tab)", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Email|test/ })).toBeNull();
  });
});

describe("Mark everyone present with no students", () => {
  it("is switched off when the class has no students", () => {
    setup([]);
    expect((screen.getByRole("button", { name: "Mark everyone present" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
