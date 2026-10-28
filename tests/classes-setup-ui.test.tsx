import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  save: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({
  saveSetup: h.save,
}));
vi.mock("@/components/admin/landing/LibraryImageField", () => ({
  LibraryImageField: ({ value }: { value: string }) => <div data-testid="cover-field">{value}</div>,
}));

import { SetupForm } from "@/components/admin/classes/SetupForm";
import type { SetupState, SetupClass } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";

const PAGE = "00000000-0000-4000-8000-000000000001";
const BANK = [
  { id: "q1", text: "How clear was the class?", type: "stars" },
  { id: "q2", text: "Was the audio good?", type: "video" },
  { id: "q3", text: "Would you recommend it?", type: "stars" },
  { id: "q4", text: "Any other thoughts?", type: "stars" },
];
const QUESTIONS = BANK.slice(0, 3).map((q) => ({ text: q.text, type: q.type as "stars" | "video" }));

const cls = (n: number, date: string, over: Partial<SetupClass> = {}): SetupClass => ({
  id: `id-${n}`,
  number: n,
  startsAtIso: `${date}T14:00:00.000Z`,
  endsAtIso: `${date}T16:00:00.000Z`,
  zoom: "https://zoom.us/j/1",
  customTime: false,
  customZoom: false,
  date,
  title: "",
  speaker: "",
  hasData: false,
  ...over,
});

const state = (over: Partial<SetupState> = {}): SetupState => ({
  title: "Batch One",
  defaults: { start: "19:00", end: "21:00", zoom: "https://zoom.us/j/1" },
  coverUrl: null,
  classes: [],
  questions: QUESTIONS,
  type: "course",
  ...over,
});

const day = (n: number) => screen.getByRole("button", { name: new RegExp(`\\b${n} November 2026`) });

function show(s: SetupState) {
  return render(<SetupForm pageId={PAGE} state={s} initialMonth="2026-11" />);
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.save.mockResolvedValue({ ok: true, message: "Classes saved" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ questions: BANK }) }));
});

describe("SetupForm", () => {
  it("webinar batch allows only one day", () => {
    show(state({ type: "webinar" }));
    fireEvent.click(day(9));
    fireEvent.click(day(10));
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
    expect(screen.getByText(/only one day/i)).toBeTruthy();
    expect(day(9).getAttribute("aria-pressed")).toBe("true");
    expect(day(10).getAttribute("aria-pressed")).toBe("false");
  });

  it("day with its own time shows highlighted, others show same as default", () => {
    show(state({
      classes: [
        cls(1, "2026-11-09"),
        cls(2, "2026-11-10", { customTime: true, ownStart: "18:00", ownEnd: "20:30" }),
      ],
    }));
    const plain = screen.getByTestId("day-row-2026-11-09");
    const own = screen.getByTestId("day-row-2026-11-10");
    expect(within(plain).getByText("Same as default")).toBeTruthy();
    expect(plain.getAttribute("data-highlight")).toBe("false");
    expect(within(own).getByText("Own time")).toBeTruthy();
    expect(own.getAttribute("data-highlight")).toBe("true");
  });

  it("unticking a day with data asks for confirmation naming the loss", async () => {
    show(state({ classes: [cls(1, "2026-11-09", { hasData: true }), cls(2, "2026-11-10")] }));
    fireEvent.click(day(9));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/attendance marks/i);
    expect(dialog.textContent).toMatch(/quiz results/i);
    expect(dialog.textContent).toMatch(/feedback answers are kept/i);
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: /yes, remove/i }));
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][1].confirmRemoveIds).toEqual(["id-1"]);
  });

  it("unticking a day without data just removes it", () => {
    show(state({ classes: [cls(1, "2026-11-09"), cls(2, "2026-11-10")] }));
    fireEvent.click(day(9));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
  });

  it("submit sends one saveSetup call with the chosen days", async () => {
    show(state());
    fireEvent.click(day(9));
    fireEvent.click(day(10));
    fireEvent.click(screen.getByRole("button", { name: "Create all classes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    const [pageId, form] = h.save.mock.calls[0];
    expect(pageId).toBe(PAGE);
    expect(form.days.map((d: { date: string }) => d.date)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(form.defaults).toEqual({ start: "19:00", end: "21:00", zoom: "https://zoom.us/j/1" });
    expect(form.questions).toEqual(QUESTIONS);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith(expect.stringMatching(/\/sessions$/)));
    expect(h.success).toHaveBeenCalledWith("Classes saved");
  });

  it("keeps the form and shows a toast when saving fails", async () => {
    h.save.mockResolvedValue({ ok: false, message: "Nope" });
    show(state());
    fireEvent.click(day(9));
    fireEvent.click(screen.getByRole("button", { name: "Create all classes" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Nope"));
    expect(h.push).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
  });

  it("button says Save changes when classes exist", () => {
    show(state({ classes: [cls(1, "2026-11-09")] }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create all classes" })).toBeNull();
  });

  it("custom values are sent back unchanged for an existing custom class", async () => {
    show(state({
      classes: [cls(1, "2026-11-09", {
        customTime: true, customZoom: true, ownStart: "18:00", ownEnd: "20:30", ownZoom: "https://zoom.us/j/own", title: "Intro", speaker: "Dr A",
      })],
    }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][1].days).toEqual([
      { date: "2026-11-09", existingId: "id-1", start: "18:00", end: "20:30", zoom: "https://zoom.us/j/own", title: "Intro", speaker: "Dr A" },
    ]);
  });

  it("shows the batch type as a plain label, not a toggle", () => {
    show(state({ type: "workshop" }));
    expect(screen.getByText("Workshop")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Webinar" })).toBeNull();
  });
});
