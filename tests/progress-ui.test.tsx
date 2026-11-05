import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup, within } from "@testing-library/react";
import { MyIdSection } from "@/components/progress/MyIdSection";
import { MyProgress } from "@/components/progress/MyProgress";
import type { FindMyIdByNameResult } from "@/app/progress/actions";
import type { Progress, ProgressBatch } from "@/lib/progress/build";
import type { Standing } from "@/lib/progress/my-progress";

// Fake people only. Extra surname/email-shaped fields are smuggled in to prove they never render.
const SURNAME = "Fakesurnameson";
const EMAIL = "sample.person@example.com";

const findId = vi.fn<(q: string) => Promise<FindMyIdByNameResult>>();

function row(firstName: string, pzId: string, batchTitle: string) {
  return { firstName, pzId, batchTitle, surname: SURNAME, email: EMAIL, displayName: `${firstName} ${SURNAME}` } as unknown as {
    firstName: string;
    pzId: string;
    batchTitle: string;
  };
}

const liveBatch: ProgressBatch = {
  title: "Sample Batch 1",
  slug: "sample-batch-1",
  latest: true,
  mode: "live",
  attendance: {
    attended: 3,
    held: 4,
    pct: 75,
    meetsMin: true,
    minPct: 75,
    rows: [
      { number: 1, title: "Enzyme Basics", startsAt: "2026-10-02T13:30:00Z", state: "present", how: "check-in" },
      { number: 2, title: "Second Class", startsAt: "2026-10-09T13:30:00Z", state: "present", how: "admin" },
      { number: 3, title: "Third Class", startsAt: "2026-10-16T13:30:00Z", state: "present", how: "check-in" },
      { number: 4, title: "Fourth Class", startsAt: "2026-10-23T13:30:00Z", state: "absent", how: null },
      { number: 5, title: "Fifth Class", startsAt: "2026-12-30T13:30:00Z", state: "upcoming", how: null },
    ],
  },
  results: {
    total: 15,
    rows: [
      { number: 1, title: "Enzyme Basics", startsAt: "2026-10-02T13:30:00Z", score: 8, max: 10, rank: 4, of: 52 },
      { number: 2, title: "Second Class", startsAt: "2026-10-09T13:30:00Z", score: 7, max: null, rank: 2, of: 52 },
    ],
  },
};

const recordedBatch: ProgressBatch = {
  title: "Old Recorded Batch",
  slug: "old-recorded",
  latest: false,
  mode: "recorded",
  attendance: null,
  results: {
    total: 9,
    rows: [{ number: 1, title: "Recorded Quiz", startsAt: "2026-08-02T13:30:00Z", score: 9, max: 10, rank: null, of: null }],
  },
};

const lowBatch: ProgressBatch = {
  ...liveBatch,
  title: "Low Workshop",
  slug: "low-ws",
  latest: false,
  attendance: { ...liveBatch.attendance!, attended: 1, pct: 25, meetsMin: false },
};

function progress(over: Partial<Progress> = {}): Progress {
  const p = {
    firstName: "Sample",
    pzId: "Sample-0000",
    groups: [
      { kind: "course", batches: [liveBatch, recordedBatch] },
      { kind: "workshop", batches: [lowBatch] },
      { kind: "webinar", batches: [] },
    ],
    surname: SURNAME,
    email: EMAIL,
    ...over,
  };
  return p as unknown as Progress;
}

function setup() {
  return render(<MyIdSection findId={findId} />);
}

function setupProgress(p: Progress = progress(), standings: Record<string, Standing> = {}) {
  return render(<MyProgress progress={p} standings={standings} />);
}

const nameBox = () => screen.getByLabelText("Type your full name") as HTMLInputElement;

async function searchName(q: string) {
  fireEvent.change(nameBox(), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: /^find my id$/i }));
}

beforeEach(() => {
  findId.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Find My ID box", () => {
  it("too short: answers on the page without calling the server", async () => {
    setup();
    await searchName("Sa");
    expect(await screen.findByText("Name too short")).toBeTruthy();
    expect(findId).not.toHaveBeenCalled();
  });

  it("server too_short, not found, rate limited and error states", async () => {
    setup();
    findId.mockResolvedValueOnce({ status: "too_short" });
    await searchName("Sam");
    expect(await screen.findByText("Name too short")).toBeTruthy();

    findId.mockResolvedValueOnce({ status: "not_found" });
    await searchName("Nobody");
    expect(await screen.findByText("We could not find that name")).toBeTruthy();
    expect(nameBox().getAttribute("aria-invalid")).toBe("true");

    findId.mockResolvedValueOnce({ status: "rate_limited" });
    await searchName("Sample");
    expect(await screen.findByText("Too many tries")).toBeTruthy();

    findId.mockResolvedValueOnce({ status: "error", message: "Something went wrong. Please try again in a minute." });
    await searchName("Sample");
    expect(await screen.findByText("Something went wrong. Please try again in a minute.")).toBeTruthy();

    findId.mockRejectedValueOnce(new Error("network"));
    await searchName("Sample");
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
  });

  it("single match shows the big ID; Copy turns to Copied for 2 seconds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    findId.mockResolvedValueOnce({ status: "ok", rows: [row("Sample", "Sample-0000", "Sample Batch 1")], more: false });
    await searchName("Sample");
    expect(await screen.findByText("Sample-0000")).toBeTruthy();
    expect(screen.getByText("Batch: Sample Batch 1")).toBeTruthy();

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy id sample-0000/i }));
    });
    expect(writeText).toHaveBeenCalledWith("Sample-0000");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Copied.")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole("button", { name: /copy id sample-0000/i }).textContent).toContain("Copy");
  });

  it("clipboard blocked: says so plainly", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    findId.mockResolvedValueOnce({ status: "ok", rows: [row("Sample", "Sample-0000", "Sample Batch 1")], more: false });
    await searchName("Sample");
    fireEvent.click(await screen.findByRole("button", { name: /copy id sample-0000/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/did not let us copy/i);
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("multi match: each row has its own Copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    findId.mockResolvedValueOnce({
      status: "ok",
      rows: [row("Sample", "Sample-0000", "Sample Batch 1"), row("Sample", "Sample-1111", "Sample Batch 2")],
      more: false,
    });
    await searchName("Sample");
    expect(await screen.findByText("2 matches found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy ID Sample-1111" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Sample-1111"));
  });
});

describe("Find My ID box: full name, long names, more matches, announcements", () => {
  it("asks for the full name and describes the box with a short hint only", async () => {
    setup();
    expect(nameBox().getAttribute("aria-describedby")).toBe("progress-name-hint");
    expect(document.getElementById("progress-name-hint")?.textContent).toMatch(/at least 3 letters/i);
    findId.mockResolvedValueOnce({
      status: "ok",
      rows: [row("Sample", "Sample-0000", "Sample Batch 1"), row("Sample", "Sample-1111", "Sample Batch 2")],
      more: false,
    });
    await searchName("Sample Name");
    await screen.findByText("2 matches found");
    expect(document.getElementById("progress-name-hint")?.textContent).not.toMatch(/Sample-0000/);
  });

  it("too_long gets its own plain message, not 'too short'", async () => {
    setup();
    findId.mockResolvedValueOnce({ status: "too_long" });
    await searchName("x".repeat(61));
    expect(await screen.findByText("That name is too long. Type just your full name.")).toBeTruthy();
    expect(screen.queryByText("Name too short")).toBeNull();
    expect(nameBox().getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the 'more people match' message only when the server says more", async () => {
    setup();
    const rows = Array.from({ length: 5 }, (_, i) => row("Sample", `Sample-000${i}`, "Sample Batch 1"));
    findId.mockResolvedValueOnce({ status: "ok", rows, more: true });
    await searchName("Sample");
    expect(await screen.findByText("More people match. Type your full name to narrow it down.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Copy ID/ })).toHaveLength(5);
    findId.mockResolvedValueOnce({ status: "ok", rows, more: false });
    await searchName("Sample Name");
    await waitFor(() => expect(screen.queryByText(/More people match/)).toBeNull());
  });

  it("has exactly one polite live region with a one-line summary, and no nested alert", async () => {
    const { container } = setup();
    findId.mockResolvedValueOnce({
      status: "ok",
      rows: [row("Sample", "Sample-0000", "Sample Batch 1"), row("Sample", "Sample-1111", "Sample Batch 2")],
      more: false,
    });
    await searchName("Sample");
    await screen.findByText("2 matches found");
    const live = container.querySelector("#progress-name-status");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.textContent).toBe("2 matches found.");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    findId.mockResolvedValueOnce({ status: "not_found" });
    await searchName("Nobody");
    await screen.findByText("We could not find that name");
    expect(container.querySelector("[aria-live] [role='alert']")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("My Progress view", () => {
  it("no batches: friendly message, no batch switch", () => {
    setupProgress(progress({ groups: [] }));
    expect(screen.getByText(/no classes to show yet/i)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Sample" })).toBeTruthy();
  });

  it("one batch: no switch, attendance ring and minimum from the real minPct", () => {
    setupProgress(progress({ groups: [{ kind: "course", batches: [liveBatch] }] }));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Sample-0000")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Attended 3 of 4 classes (75%)" })).toBeTruthy();
    expect(screen.getByText("Attended 3 of 4 classes held")).toBeTruthy();
    expect(screen.getByText("Meets the 75% minimum")).toBeTruthy();
    expect(screen.queryByText(/goal/i)).toBeNull();
  });

  it("several batches: real tabs, latest first, arrow keys switch", () => {
    setupProgress();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["CourseSample Batch 1", "CourseOld Recorded Batch", "WorkshopLow Workshop"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[0].id);
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[2]);
    expect(screen.getByText("Below the 75% minimum")).toBeTruthy();
  });

  it("recorded batch: no attendance, no rank, says why", () => {
    setupProgress(progress(), { "old-recorded": { rank: null, of: 9, gap: null, max: 10 } });
    fireEvent.click(screen.getByRole("tab", { name: /Old Recorded Batch/ }));
    expect(screen.getByText("Attendance is not tracked for recorded students.")).toBeTruthy();
    expect(screen.getByText(/Recorded students are not ranked/)).toBeTruthy();
    expect(screen.queryByText("Batch rank")).toBeNull();
    expect(screen.queryByRole("img", { name: /Attended/ })).toBeNull();
    expect(screen.getByText("of 10 points")).toBeTruthy();
    expect(screen.queryByText(/Class rank/)).toBeNull();
  });

  it("rank badge and gap line only from a real live standing", () => {
    const { unmount } = setupProgress(progress());
    expect(screen.queryByText("Batch rank")).toBeNull();
    expect(screen.queryByText(/more points? to reach/)).toBeNull();
    unmount();
    setupProgress(progress(), { "sample-batch-1": { rank: 4, of: 52, gap: { points: 1250, rank: 3 }, max: 20 } });
    expect(screen.getByText("Batch rank")).toBeTruthy();
    expect(screen.getByText("of 52")).toBeTruthy();
    expect(screen.getByText("1,250 more points to reach #3")).toBeTruthy();
  });

  it("badges: none without real backing; Top 3 for a live rank of 3 or better; Perfect attendance when nothing was missed", () => {
    const { unmount } = setupProgress(progress());
    expect(screen.queryByRole("heading", { name: "Badges" })).toBeNull();
    unmount();
    const perfect: ProgressBatch = { ...liveBatch, attendance: { ...liveBatch.attendance!, attended: 4, pct: 100 } };
    setupProgress(progress({ groups: [{ kind: "course", batches: [perfect] }] }), { "sample-batch-1": { rank: 2, of: 52, gap: null, max: null } });
    expect(screen.getByRole("heading", { name: "Badges" })).toBeTruthy();
    expect(screen.getByText("Perfect attendance")).toBeTruthy();
    expect(screen.getByText("Attended all 4 classes held")).toBeTruthy();
    expect(screen.getByText("Top 3")).toBeTruthy();
    expect(screen.getByText("Rank 2 of 52 in this batch")).toBeTruthy();
    expect(screen.queryByText(/streak/i)).toBeNull();
  });

  it("class-by-class ledger: state chips, points with max, class rank, and the next class", () => {
    setupProgress();
    const list = screen.getByRole("list", { name: "Class by class" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("Class 1 · Enzyme Basics");
    expect(within(items[0]).getByText("Present (check-in)")).toBeTruthy();
    expect(within(items[0]).getByText("of 10 pts")).toBeTruthy();
    expect(within(items[0]).getByText("Class rank 4 of 52")).toBeTruthy();
    expect(within(items[1]).getByText("Present (by admin)")).toBeTruthy();
    expect(within(items[1]).getByText("points")).toBeTruthy();
    expect(within(items[3]).getByText("Absent")).toBeTruthy();
    expect(within(items[4]).getByText("Next class")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next class" })).toBeTruthy();
    expect(screen.getAllByText(/Fri 2 Oct, 6:30 pm PKT/).length).toBeGreaterThan(0);
  });

  it("score card: total, 'of max' and a bar only when the max is known", () => {
    const { unmount } = setupProgress();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    unmount();
    setupProgress(progress(), { "sample-batch-1": { rank: 4, of: 52, gap: null, max: 20 } });
    expect(screen.getByText("of 20 points")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("75");
  });

  it("share opens WhatsApp with the public batch page only", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    setupProgress();
    fireEvent.click(screen.getByRole("button", { name: "Share on WhatsApp" }));
    const href = String(open.mock.calls[0][0]);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.split("text=")[1]);
    expect(text).toContain("/progress/sample-batch-1");
    expect(text).not.toContain("Sample-0000");
    expect(screen.getByRole("link", { name: /See batch leaderboard/ }).getAttribute("href")).toBe("/progress/sample-batch-1");
  });
});

describe("privacy and layout", () => {
  it("never renders an email, an @ or a surname", async () => {
    findId.mockResolvedValueOnce({
      status: "ok",
      rows: [row("Sample", "Sample-0000", "Sample Batch 1"), row("Sample", "Sample-1111", "Sample Batch 2")],
      more: false,
    });
    const { container } = render(
      <>
        <MyIdSection findId={findId} />
        <MyProgress progress={progress()} />
      </>,
    );
    await searchName("Sample");
    await screen.findByText("2 matches found");
    // look at every batch
    for (const tab of ["Sample Batch 1", "Old Recorded Batch", "Low Workshop"]) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab, "i") }));
      const text = container.textContent ?? "";
      expect(text).not.toContain("@");
      expect(text).not.toContain(SURNAME);
      expect(text).not.toContain(EMAIL);
      expect(container.innerHTML).not.toContain(SURNAME);
    }
  });

  it("no fixed widths that would force sideways scroll; inputs are 16px or larger", () => {
    const { container } = render(
      <>
        <MyIdSection findId={findId} />
        <MyProgress progress={progress()} />
      </>,
    );
    const tooWide = /(?:^|\s)(?:min-)?w-\[(\d+)px\]/;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("[class]"))) {
      const m = tooWide.exec(el.getAttribute("class") ?? "");
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(320);
      expect(el.getAttribute("class")).not.toMatch(/(?:^|\s)(?:min-)?w-(?:96|80|72)(?:\s|$)/);
    }
    for (const input of Array.from(container.querySelectorAll("input"))) {
      expect(input.className).toMatch(/(?:^|\s)text-(?:base|lg|xl|2xl)(?:\s|$)/);
    }
  });
});
