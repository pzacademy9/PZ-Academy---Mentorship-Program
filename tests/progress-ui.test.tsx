import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { MyIdSection } from "@/components/progress/MyIdSection";
import { ProgressSection } from "@/components/progress/ProgressSection";
import type { FindMyIdByNameResult } from "@/app/progress/actions";
import type { Progress, ProgressBatch } from "@/lib/progress/build";

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

function setupProgress(p: Progress = progress()) {
  return render(<ProgressSection progress={p} />);
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

describe("Progress view", () => {
  it("no classes yet message when there are no groups", () => {
    setupProgress(progress({ groups: [] }));
    expect(screen.getByText(/no classes to show yet/i)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("real tabs: switch with click and arrow keys", async () => {
    setupProgress();
    const [att, res] = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(att.getAttribute("aria-selected")).toBe("true");
    expect(res.getAttribute("aria-selected")).toBe("false");
    expect(res.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(att.id);

    fireEvent.click(res);
    expect(res.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Total score: 15")).toBeTruthy();
    expect(screen.queryByText(/Attended 3 of 4/)).toBeNull();

    fireEvent.keyDown(res, { key: "ArrowLeft" });
    expect(att.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(att);
    expect(screen.getByText("Attended 3 of 4 classes (75%)")).toBeTruthy();
  });

  it("category headings shown, empty groups hidden", async () => {
    setupProgress();
    expect(screen.getByRole("heading", { name: "Courses" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Workshops" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Webinars" })).toBeNull();
  });

  it("latest batch starts open, others closed; toggling works", async () => {
    setupProgress();
    const latest = screen.getByRole("button", { name: /sample batch 1/i });
    const old = screen.getByRole("button", { name: /old recorded batch/i });
    expect(latest.getAttribute("aria-expanded")).toBe("true");
    expect(old.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Latest")).toBeTruthy();

    fireEvent.click(latest);
    expect(latest.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Attended 3 of 4 classes (75%)")).toBeNull();
    fireEvent.click(latest);
    expect(screen.getByText("Attended 3 of 4 classes (75%)")).toBeTruthy();
  });

  it("attendance header, target tag and all session tags", async () => {
    setupProgress();
    expect(screen.getByText("Meets 75% target")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("75");
    expect(screen.getAllByText("Present (marked at check-in)")).toHaveLength(2);
    expect(screen.getByText("Present (marked by admin)")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText(/Fri 2 Oct, 6:30 pm PKT/)).toBeTruthy();
    expect(screen.queryByText(/GMT/)).toBeNull();
  });

  it("below target is stated plainly", async () => {
    setupProgress();
    fireEvent.click(screen.getByRole("button", { name: /low workshop/i }));
    expect(screen.getByText("Below the 75% target")).toBeTruthy();
  });

  it("results: score / max, score alone when max is null, rank when present", async () => {
    setupProgress();
    fireEvent.click(screen.getByRole("tab", { name: /quiz results/i }));
    expect(screen.getByText("8 / 10")).toBeTruthy();
    expect(screen.getByText("Rank 4 of 52")).toBeTruthy();
    const second = screen.getByText(/02\. Second Class/).closest("li")!;
    expect(second.textContent).toContain("Score: 7");
    expect(second.textContent).not.toContain("/");
    expect(screen.queryByText(/Top \d+%/)).toBeNull();
  });

  it("recorded student sees the note and no rank", async () => {
    setupProgress();
    fireEvent.click(screen.getByRole("button", { name: /old recorded batch/i }));
    expect(screen.getByText(/attendance is not tracked for recorded students/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /quiz results/i }));
    const quiz = screen.getByText(/01\. Recorded Quiz/).closest("li")!;
    expect(quiz.textContent).not.toMatch(/Rank/);
    expect(screen.getByText(/ranks are shown for live students only/i)).toBeTruthy();
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
        <ProgressSection progress={progress()} />
      </>,
    );
    await searchName("Sample");
    await screen.findByText("2 matches found");
    // open every card in both tabs
    for (const tab of ["Attendance", "Quiz Results"]) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab, "i") }));
      for (const b of screen.queryAllByRole("button", { expanded: false })) fireEvent.click(b);
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
        <ProgressSection progress={progress()} />
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
