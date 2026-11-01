import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { ProgressPage } from "@/components/progress/ProgressPage";
import type { FindMyIdByNameResult, MyProgressResult } from "@/app/progress/actions";
import type { Progress, ProgressBatch } from "@/lib/progress/build";

// Fake people only. Extra surname/email-shaped fields are smuggled in to prove they never render.
const SURNAME = "Fakesurnameson";
const EMAIL = "sample.person@example.com";

const findId = vi.fn<(q: string) => Promise<FindMyIdByNameResult>>();
const getProgress = vi.fn<(id: string) => Promise<MyProgressResult>>();

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
  return render(<ProgressPage findId={findId} getProgress={getProgress} />);
}

const nameBox = () => screen.getByLabelText("Type your first name") as HTMLInputElement;
const idBox = () => screen.getByLabelText("Your PZ ID") as HTMLInputElement;

async function searchName(q: string) {
  fireEvent.change(nameBox(), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: /^find my id$/i }));
}

async function showProgress(id: string) {
  fireEvent.change(idBox(), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: /show my progress/i }));
  await screen.findByRole("heading", { name: /hello, sample/i });
}

beforeEach(() => {
  findId.mockReset();
  getProgress.mockReset();
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

  it("single match shows the big ID; Copy turns to Copied for 2 seconds and fills step 2", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    findId.mockResolvedValueOnce({ status: "ok", rows: [row("Sample", "Sample-0000", "Sample Batch 1")] });
    await searchName("Sample");
    expect(await screen.findByText("Sample-0000")).toBeTruthy();
    expect(screen.getByText("Batch: Sample Batch 1")).toBeTruthy();

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy id sample-0000/i }));
    });
    expect(writeText).toHaveBeenCalledWith("Sample-0000");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText(/we also put it in the box below/i)).toBeTruthy();
    expect(idBox().value).toBe("Sample-0000");

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole("button", { name: /copy id sample-0000/i }).textContent).toContain("Copy");
  });

  it("clipboard blocked: says so plainly and still fills the ID box", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    findId.mockResolvedValueOnce({ status: "ok", rows: [row("Sample", "Sample-0000", "Sample Batch 1")] });
    await searchName("Sample");
    fireEvent.click(await screen.findByRole("button", { name: /copy id sample-0000/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/did not let us copy/i);
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(idBox().value).toBe("Sample-0000");
  });

  it("multi match: Use fills the ID box and moves focus there", async () => {
    setup();
    findId.mockResolvedValueOnce({
      status: "ok",
      rows: [row("Sample", "Sample-0000", "Sample Batch 1"), row("Sample", "Sample-1111", "Sample Batch 2")],
    });
    await searchName("Sample");
    expect(await screen.findByText("2 matches found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use ID Sample-1111" }));
    expect(idBox().value).toBe("Sample-1111");
    expect(document.activeElement).toBe(idBox());
  });
});

describe("My Progress Tracker box", () => {
  it("empty ID asks for the ID without calling the server", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /show my progress/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/type your pz id first/i);
    expect(getProgress).not.toHaveBeenCalled();
  });

  it("wrong ID, rate limited and error states", async () => {
    setup();
    getProgress.mockResolvedValueOnce({ status: "not_found" });
    fireEvent.change(idBox(), { target: { value: "Nope-1234" } });
    fireEvent.click(screen.getByRole("button", { name: /show my progress/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not find that id/i);
    expect(idBox().getAttribute("aria-invalid")).toBe("true");

    getProgress.mockResolvedValueOnce({ status: "rate_limited" });
    fireEvent.click(screen.getByRole("button", { name: /show my progress/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too many tries/i));

    getProgress.mockResolvedValueOnce({ status: "error", message: "Something went wrong. Please try again in a minute." });
    fireEvent.click(screen.getByRole("button", { name: /show my progress/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/something went wrong/i));
  });

  it("Forgot your ID focuses the name box", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /forgot your id/i }));
    expect(document.activeElement).toBe(nameBox());
  });

  it("shows greeting, PZ ID and moves focus to the greeting", async () => {
    getProgress.mockResolvedValueOnce({ status: "ok", progress: progress() });
    setup();
    await showProgress("Sample-0000");
    expect(getProgress).toHaveBeenCalledWith("Sample-0000");
    const hello = screen.getByRole("heading", { name: "Hello, Sample" });
    await waitFor(() => expect(document.activeElement).toBe(hello));
  });

  it("no classes yet message when there are no groups", async () => {
    getProgress.mockResolvedValueOnce({ status: "ok", progress: progress({ groups: [] }) });
    setup();
    await showProgress("Sample-0000");
    expect(screen.getByText(/no classes to show yet/i)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("Progress view", () => {
  beforeEach(() => {
    getProgress.mockResolvedValue({ status: "ok", progress: progress() });
  });

  it("real tabs: switch with click and arrow keys", async () => {
    setup();
    await showProgress("Sample-0000");
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
    setup();
    await showProgress("Sample-0000");
    expect(screen.getByRole("heading", { name: "Courses" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Workshops" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Webinars" })).toBeNull();
  });

  it("latest batch starts open, others closed; toggling works", async () => {
    setup();
    await showProgress("Sample-0000");
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
    setup();
    await showProgress("Sample-0000");
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
    setup();
    await showProgress("Sample-0000");
    fireEvent.click(screen.getByRole("button", { name: /low workshop/i }));
    expect(screen.getByText("Below the 75% target")).toBeTruthy();
  });

  it("results: score / max, score alone when max is null, rank when present", async () => {
    setup();
    await showProgress("Sample-0000");
    fireEvent.click(screen.getByRole("tab", { name: /quiz results/i }));
    expect(screen.getByText("8 / 10")).toBeTruthy();
    expect(screen.getByText("Rank 4 of 52")).toBeTruthy();
    const second = screen.getByText(/02\. Second Class/).closest("li")!;
    expect(second.textContent).toContain("Score: 7");
    expect(second.textContent).not.toContain("/");
    expect(screen.queryByText(/Top \d+%/)).toBeNull();
  });

  it("recorded student sees the note and no rank", async () => {
    setup();
    await showProgress("Sample-0000");
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
    });
    getProgress.mockResolvedValue({ status: "ok", progress: progress() });
    const { container } = setup();
    await searchName("Sample");
    await screen.findByText("2 matches found");
    await showProgress("Sample-0000");
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

  it("no fixed widths that would force sideways scroll; inputs are 16px or larger", async () => {
    getProgress.mockResolvedValue({ status: "ok", progress: progress() });
    const { container } = setup();
    await showProgress("Sample-0000");
    const tooWide = /(?:^|\s)(?:min-)?w-\[(\d+)px\]/;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("[class]"))) {
      const m = tooWide.exec(el.getAttribute("class") ?? "");
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(320);
      expect(el.getAttribute("class")).not.toMatch(/(?:^|\s)(?:min-)?w-(?:96|80|72)(?:\s|$)/);
    }
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("w-full");
    expect(root.className).toContain("min-w-0");
    for (const input of Array.from(container.querySelectorAll("input"))) {
      expect(input.className).toMatch(/(?:^|\s)text-(?:base|lg|xl|2xl)(?:\s|$)/);
    }
  });
});
