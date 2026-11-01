import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { BatchPortal } from "@/components/progress/portal/BatchPortal";
import type { PortalBatchView } from "@/lib/progress/portal-build";

const cls = (number: number, state: "present" | "absent" | "upcoming", how: "check-in" | "admin" | null = null) => ({
  number,
  title: `Topic ${number}`,
  startsAt: "2026-03-01T10:00:00Z",
  state,
  how,
});

function view(over: Partial<PortalBatchView> = {}): PortalBatchView {
  return {
    title: "Sample Batch",
    slug: "sample-batch",
    kind: "course",
    minPct: 75,
    state: "live",
    coverUrl: null,
    students: 4,
    classesHeld: 3,
    sessions: [
      { id: "s1", number: 1, title: "Topic 1", quizMax: 100 },
      { id: "s2", number: 2, title: "Topic 2", quizMax: null },
    ],
    attendance: [
      {
        firstName: "Sample",
        pzId: "Sample-0001",
        mode: "live",
        attended: 2,
        held: 3,
        pct: 67,
        meetsMin: false,
        classes: [cls(1, "present", "check-in"), cls(2, "present", "admin"), cls(3, "absent"), cls(4, "upcoming")],
      },
      { firstName: "Faro", pzId: "Faro-0002", mode: "live", attended: 3, held: 3, pct: 100, meetsMin: true, classes: [cls(1, "present", "check-in")] },
      { firstName: "Bilal", pzId: "Bilal-0003", mode: "recorded", attended: null, held: null, pct: null, meetsMin: null, classes: [] },
      { firstName: "Newbie", pzId: "Newbie-0004", mode: "live", attended: 0, held: 0, pct: null, meetsMin: false, classes: [cls(1, "upcoming")] },
    ],
    overall: [
      { firstName: "Faro", pzId: "Faro-0002", mode: "live", score: 90, rank: 1 },
      { firstName: "Sample", pzId: "Sample-0001", mode: "live", score: 90, rank: 1 },
      { firstName: "Bilal", pzId: "Bilal-0003", mode: "recorded", score: 70, rank: null },
    ],
    perClass: {
      s1: [{ firstName: "Faro", pzId: "Faro-0002", mode: "live", score: 90, rank: 1 }],
      s2: [],
    },
    ...over,
  };
}

describe("BatchPortal attendance", () => {
  it("shows header facts, one h1, minimum note and back link", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Sample Batch"]);
    expect(screen.getByText("3 classes held")).toBeTruthy();
    expect(screen.getByText("4 students")).toBeTruthy();
    expect(screen.getByText("Minimum attendance: 75%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to all batches/ }).getAttribute("href")).toBe("/progress");
    expect(document.querySelector("[data-cover-placeholder]")).not.toBeNull();
  });

  it("shows the cover image when there is one", () => {
    render(<BatchPortal view={view({ coverUrl: "https://x.test/c.jpg" })} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://x.test/c.jpg");
  });

  it("live row shows attended count, percent and target chip; below chip when under", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getByText("Attended 2 of 3 classes (67%)")).toBeTruthy();
    expect(screen.getByText("Below 75%")).toBeTruthy();
    expect(screen.getByText("Attended 3 of 3 classes (100%)")).toBeTruthy();
    expect(screen.getByText("Meets 75% target")).toBeTruthy();
    expect(screen.getByText("Sample-0001")).toBeTruthy();
  });

  it("recorded row says Not tracked, has no percent and no expander", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getByText("Not tracked")).toBeTruthy();
    expect(screen.getByText("Recorded student")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Bilal/ })).toBeNull();
  });

  it("a live student with no held class says No classes yet and shows no percent", () => {
    render(<BatchPortal view={view()} />);
    const row = screen.getByRole("button", { name: /Newbie/ });
    expect(within(row).getByText("No classes yet")).toBeTruthy();
    expect(row.textContent).not.toContain("%");
  });

  it("expands the class list inline and collapses it again", () => {
    render(<BatchPortal view={view()} />);
    const btn = screen.getByRole("button", { name: /Sample-0001/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Class 3 - Topic 3/)).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Class 1 - Topic 1")).toBeTruthy();
    expect(screen.getByText("Present (check-in)")).toBeTruthy();
    expect(screen.getByText("Present (by admin)")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getAllByText("Upcoming").length).toBeGreaterThan(0);
    fireEvent.click(btn);
    expect(screen.queryByText(/Class 3 - Topic 3/)).toBeNull();
  });

  it("search matches first name or PZ ID, ignores case and spaces, shared with the Results tab", () => {
    render(<BatchPortal view={view()} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: " SAMPLE " } });
    expect(screen.getByRole("button", { name: /Sample-0001/ })).toBeTruthy();
    expect(screen.queryByText("Faro-0002")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 4");
    fireEvent.change(box, { target: { value: "faro-0002" } });
    expect(screen.queryByText("Sample-0001")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));
    expect(screen.getByText("Faro-0002")).toBeTruthy();
    expect(screen.queryByText("Sample-0001")).toBeNull();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No one matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Attendance" }));
    expect(screen.getByText("No one matches")).toBeTruthy();
  });

  it("tabs are real tabs with one tabpanel", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getByRole("tab", { name: "Attendance" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));
    expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });
});

describe("BatchPortal results", () => {
  const open = (v = view()) => {
    render(<BatchPortal view={v} />);
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  };

  it("overall shows tied ranks equally, recorded rows with a chip and no rank", () => {
    open();
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toMatch(/Rank 1/);
    expect(items[1].textContent).toMatch(/Rank 1/);
    expect(items[2].textContent).not.toMatch(/Rank/);
    expect(within(items[2]).getByText("Recorded")).toBeTruthy();
    expect(within(items[2]).getByText("70")).toBeTruthy();
  });

  it("switches to one class and shows 'of max' only when known", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Class 1" }));
    expect(screen.getByText("of 100", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Sample-0001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Class 2" }));
    expect(screen.getByText("No results yet")).toBeTruthy();
  });

  it("no results at all says No results yet", () => {
    open(view({ overall: [], perClass: { s1: [], s2: [] } }));
    expect(screen.getByText("No results yet")).toBeTruthy();
  });
});
