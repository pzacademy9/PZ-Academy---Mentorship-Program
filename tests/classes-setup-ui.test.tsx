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
  LibraryImageField: ({ value, onChange }: { value: string; onChange: (u: string) => void }) => (
    <div data-testid="cover-field">
      {value}
      <button type="button" onClick={() => onChange("")}>Clear cover</button>
    </div>
  ),
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

// Calendar cells are the only date buttons with aria-pressed (the row's Remove button has none).
const day = (n: number) =>
  screen
    .getAllByRole("button", { name: new RegExp(`\\b${n} November 2026`) })
    .find((b) => b.hasAttribute("aria-pressed")) as HTMLElement;

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

  it("labels existing days with their class number and unsaved days New", () => {
    show(state({ classes: [cls(3, "2026-11-20")] }));
    fireEvent.click(day(9));
    expect(within(screen.getByTestId("day-row-2026-11-20")).getByText(/^Day 3:/)).toBeTruthy();
    expect(within(screen.getByTestId("day-row-2026-11-09")).getByText(/^New:/)).toBeTruthy();
    const rows = screen.getAllByTestId(/^day-row-/).map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["day-row-2026-11-09", "day-row-2026-11-20"]);
  });

  it("ticking a removed existing day again restores the same class", async () => {
    show(state({ classes: [cls(1, "2026-11-09", { hasData: true, title: "Intro" }), cls(2, "2026-11-10")] }));
    fireEvent.click(day(9));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /yes, remove/i }));
    fireEvent.click(day(9));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    const form = h.save.mock.calls[0][1];
    const d = form.days.find((x: { date: string }) => x.date === "2026-11-09");
    expect(d.existingId).toBe("id-1");
    expect(d.title).toBe("Intro");
    expect(form.confirmRemoveIds).not.toContain("id-1");
  });

  it("Keep it closes the confirmation and removes nothing, with focus on Keep it", () => {
    show(state({ classes: [cls(1, "2026-11-09", { hasData: true })] }));
    fireEvent.click(day(9));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
  });

  it("Escape closes the confirmation and removes nothing", () => {
    show(state({ classes: [cls(1, "2026-11-09", { hasData: true })] }));
    fireEvent.click(day(9));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(1);
  });

  it("blocks saving with fewer than 3 questions", () => {
    show(state({ classes: [cls(1, "2026-11-09")], questions: QUESTIONS.slice(0, 2) }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(h.error).toHaveBeenCalledWith("Please pick 3 to 5 feedback questions.");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("blocks saving with more than 5 questions", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ text: `Q${i}`, type: "stars" as const }));
    show(state({ classes: [cls(1, "2026-11-09")], questions: six }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(h.error).toHaveBeenCalledWith("Please pick 3 to 5 feedback questions.");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("clearing the cover sends coverUrl null", async () => {
    show(state({ classes: [cls(1, "2026-11-09")], coverUrl: "https://drive.google.com/thumbnail?id=abc" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear cover" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][1].coverUrl).toBeNull();
  });

  it("shows the batch type as a plain label, not a toggle", () => {
    show(state({ type: "workshop" }));
    expect(screen.getByText("Workshop")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Webinar" })).toBeNull();
  });

  it("the action bar and the removal dialog clear the mobile bottom nav", () => {
    show(state({ classes: [cls(1, "2026-11-09", { hasData: true }), cls(2, "2026-11-10")] }));
    const save = screen.getByRole("button", { name: "Save changes" });
    const bar = save.closest("div.fixed") as HTMLElement;
    expect(bar.className).toContain("bottom-[calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(bar.className).toContain("z-[60]");
    expect(bar.className).toContain("lg:sticky");
    expect(bar.className).toContain("lg:bottom-0");
    fireEvent.click(day(9));
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    expect(overlay.className).toContain("z-[60]");
    expect(overlay.className).toContain("pb-24");
    expect(overlay.className).toContain("lg:pb-4");
  });

  it("a webinar that already has two classes is not limited to one day", async () => {
    show(state({ type: "webinar", classes: [cls(1, "2026-11-09"), cls(2, "2026-11-10")] }));
    fireEvent.click(day(11));
    expect(screen.getAllByTestId(/^day-row-/)).toHaveLength(3);
    fireEvent.click(day(11));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][1].days).toHaveLength(2);
  });

  it("says a reminder email goes out 60 minutes before each class", () => {
    show(state());
    expect(screen.getByText("A reminder email goes to students 60 minutes before each class. You can change this in Edit this class.")).toBeTruthy();
  });
});

describe("SetupForm: three steps on a phone", () => {
  const withDays = () => state({ classes: [cls(1, "2026-11-10"), cls(2, "2026-11-12")] });
  const next = (re: RegExp) => fireEvent.click(screen.getByRole("button", { name: re }));

  it("starts on step 1 and moves to step 2", () => {
    show(withDays());
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    next(/Next: Feedback questions/);
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("will not leave step 1 with no class days", () => {
    show(state());
    next(/Next: Feedback questions/);
    expect(screen.getByRole("alert").textContent).toContain("Pick at least one class day.");
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("will not leave step 2 with too few questions", () => {
    show({ ...withDays(), questions: QUESTIONS.slice(0, 2) });
    next(/Next: Feedback questions/);
    next(/Next: Cover image/);
    expect(h.error).toHaveBeenCalledWith("Please pick 3 to 5 feedback questions.");
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("Back keeps the chosen days", () => {
    show(withDays());
    next(/Next: Feedback questions/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(day(10).getAttribute("aria-pressed")).toBe("true");
    expect(day(12).getAttribute("aria-pressed")).toBe("true");
  });

  it("step 3 shows a schedule summary", () => {
    show(withDays());
    next(/Next: Feedback questions/);
    next(/Next: Cover image/);
    const box = screen.getByTestId("schedule-summary");
    expect(box.textContent).toContain("2 class days");
    expect(box.textContent).toContain("3 feedback questions");
    expect(box.textContent).toContain("Pakistan time");
  });

  it("the phone Save classes button saves exactly what the desktop button saves", async () => {
    const first = show(withDays());
    next(/Next: Feedback questions/);
    next(/Next: Cover image/);
    fireEvent.click(screen.getByRole("button", { name: "Save classes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    const phoneArgs = h.save.mock.calls[0];
    first.unmount();
    h.save.mockClear();
    show(withDays());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0]).toEqual(phoneArgs);
  });

  it("chosen calendar days show Day 1, Day 2 in date order", () => {
    show(withDays());
    expect(within(day(10)).getByText("Day 1")).toBeTruthy();
    expect(within(day(12)).getByText("Day 2")).toBeTruthy();
  });
});
