import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { PortalHome } from "@/components/progress/portal/PortalHome";
import type { PortalBatchCard } from "@/lib/progress/portal-build";

const card = (over: Partial<PortalBatchCard> = {}): PortalBatchCard => ({
  title: "Sample Course",
  slug: "sample-course",
  kind: "course",
  students: 52,
  classesHeld: 8,
  classesTotal: 12,
  lastClassAt: "2026-10-01T10:00:00Z",
  state: "live",
  coverUrl: null,
  courseId: null,
  courseTitle: null,
  ...over,
});

const groups = [
  { kind: "course" as const, batches: [card(), card({ title: "Done Course", slug: "done", state: "completed", classesHeld: 4, classesTotal: 4 })] },
  { kind: "workshop" as const, batches: [card({ title: "Sample Workshop", slug: "ws", kind: "workshop", state: "recorded", students: 1 })] },
  { kind: "webinar" as const, batches: [] },
];

describe("PortalHome", () => {
  it("renders groups in order with headings, hiding empty ones", () => {
    render(<PortalHome groups={groups} />);
    const heads = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(["Courses", "Workshops"]);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("links each card to its slug and shows counts", () => {
    render(<PortalHome groups={groups} />);
    const link = screen.getByRole("link", { name: /Sample Course/ });
    expect(link.getAttribute("href")).toBe("/progress/sample-course");
    expect(within(link).getByText("8 of 12 classes held")).toBeTruthy();
    expect(within(link).getByText("52 students")).toBeTruthy();
    expect(within(link).getByText("Live")).toBeTruthy();
    expect(within(link).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("67");
    const done = screen.getByRole("link", { name: /Done Course/ });
    expect(within(done).getByText("Completed")).toBeTruthy();
  });

  it("recorded card shows Self-paced and no bar", () => {
    render(<PortalHome groups={groups} />);
    const link = screen.getByRole("link", { name: /Sample Workshop/ });
    expect(within(link).getByText("Self-paced")).toBeTruthy();
    expect(within(link).queryByRole("progressbar")).toBeNull();
    expect(within(link).getByText("1 student")).toBeTruthy();
  });

  it("shows the cover image when present and a placeholder otherwise", () => {
    render(<PortalHome groups={[{ kind: "course", batches: [card({ coverUrl: "https://x.test/c.jpg" }), card({ title: "Bare", slug: "bare" })] }]} />);
    const withImg = screen.getByRole("link", { name: /Sample Course/ });
    expect(withImg.querySelector("img")?.getAttribute("src")).toBe("https://x.test/c.jpg");
    const bare = screen.getByRole("link", { name: /Bare/ });
    expect(bare.querySelector("img")).toBeNull();
    expect(bare.querySelector("[data-cover-placeholder]")).not.toBeNull();
  });

  it("shows the privacy line and tab counts", () => {
    render(<PortalHome groups={groups} />);
    expect(screen.getByText("Names and IDs only. No phone or email shown.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Courses/ }).textContent).toContain("2");
    expect(screen.getByRole("tab", { name: /Webinars/ }).textContent).toContain("0");
  });

  it("filters by title search and by tab", () => {
    render(<PortalHome groups={groups} />);
    const box = screen.getByRole("searchbox", { name: /search a batch/i });
    fireEvent.change(box, { target: { value: "workshop" } });
    expect(screen.queryByRole("link", { name: /Sample Course/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Sample Workshop/ })).toBeTruthy();
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.click(screen.getByRole("tab", { name: /Workshops/ }));
    expect(screen.queryByRole("link", { name: /Sample Course/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Sample Workshop/ })).toBeTruthy();
  });

  describe("course grouping", () => {
    const CA = { courseId: "c1", courseTitle: "Sample Programme" };
    const grouped = [
      {
        kind: "course" as const,
        batches: [
          card({ title: "Batch Old", slug: "old", state: "completed", lastClassAt: "2026-08-01T10:00:00Z", ...CA }),
          card({ title: "Batch New", slug: "new", state: "live", lastClassAt: "2026-10-01T10:00:00Z", ...CA }),
          card({ title: "Solo Course", slug: "solo", lastClassAt: "2026-11-01T10:00:00Z" }),
        ],
      },
      { kind: "workshop" as const, batches: [card({ title: "Only Workshop", slug: "ws", kind: "workshop", courseId: "c9", courseTitle: "Workshop Programme" })] },
      { kind: "webinar" as const, batches: [] },
    ];
    const course3 = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    it("puts batches of one course under that course heading, live before completed", () => {
      render(<PortalHome groups={grouped} />);
      expect(course3()).toEqual(["Solo Course", "Sample Programme", "Workshop Programme"]);
      const links = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
      expect(links.filter((h) => h?.startsWith("/progress/"))).toEqual(["/progress/solo", "/progress/new", "/progress/old", "/progress/ws"]);
    });

    it("a batch with no course is its own group headed by its title, and a single-batch course still shows a heading", () => {
      render(<PortalHome groups={grouped} />);
      expect(course3()).toContain("Solo Course");
      expect(course3()).toContain("Workshop Programme");
    });

    it("search keeps filtering across groups and hides empty groups", () => {
      render(<PortalHome groups={grouped} />);
      fireEvent.change(screen.getByRole("searchbox", { name: /search a batch/i }), { target: { value: "batch old" } });
      expect(course3()).toEqual(["Sample Programme"]);
      expect(screen.queryByRole("link", { name: /Batch New/ })).toBeNull();
      expect(screen.getByRole("link", { name: /Batch Old/ })).toBeTruthy();
    });

    it("tab counts still count batches, not groups", () => {
      render(<PortalHome groups={grouped} />);
      expect(screen.getByRole("tab", { name: /Courses/ }).textContent).toContain("3");
    });
  });

  it("empty portal says No batches yet", () => {
    render(<PortalHome groups={[]} />);
    expect(screen.getByText("No batches yet")).toBeTruthy();
  });

  it("shows a generic message when loading failed", () => {
    render(<PortalHome groups={[]} failed />);
    expect(screen.getByText(/could not load/i)).toBeTruthy();
    expect(screen.queryByText("No batches yet")).toBeNull();
  });

  it("renders the Find my ID box only when given a finder", () => {
    const { rerender } = render(<PortalHome groups={groups} />);
    expect(screen.queryByRole("heading", { name: "Find my ID" })).toBeNull();
    rerender(<PortalHome groups={groups} findId={async () => ({ status: "not_found" })} />);
    expect(screen.getByRole("heading", { name: "Find my ID" })).toBeTruthy();
  });
});
