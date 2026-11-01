// tests/portal-course-groups.test.ts
import { describe, it, expect } from "vitest";
import { groupCardsByCourse, type PortalBatchCard } from "@/lib/progress/portal-build";

const card = (over: Partial<PortalBatchCard>): PortalBatchCard => ({
  title: "Sample Batch",
  slug: "sample",
  kind: "course",
  students: 1,
  classesHeld: 1,
  classesTotal: 2,
  lastClassAt: "2026-10-01T10:00:00Z",
  state: "live",
  coverUrl: null,
  courseId: null,
  courseTitle: null,
  ...over,
});

describe("groupCardsByCourse", () => {
  it("groups by course and heads each group with the course title", () => {
    const groups = groupCardsByCourse([
      card({ slug: "a", courseId: "c1", courseTitle: "Programme One" }),
      card({ slug: "b", courseId: "c1", courseTitle: "Programme One" }),
      card({ slug: "c", courseId: "c2", courseTitle: "Programme Two" }),
    ]);
    expect(groups.map((g) => [g.heading, g.batches.map((b) => b.slug).sort()])).toEqual([
      ["Programme One", ["a", "b"]],
      ["Programme Two", ["c"]],
    ]);
  });

  it("a batch with no course (or an unknown course title) is its own group headed by the batch title", () => {
    const groups = groupCardsByCourse([
      card({ slug: "a", title: "Alpha" }),
      card({ slug: "b", title: "Beta", courseId: "c1", courseTitle: null }),
      card({ slug: "c", title: "Gamma", courseId: "c1", courseTitle: "  " }),
    ]);
    expect(groups.map((g) => g.heading).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(groups.every((g) => g.batches.length === 1)).toBe(true);
  });

  it("orders groups by most recent class, newest first, and null dates last", () => {
    const groups = groupCardsByCourse([
      card({ slug: "old", courseId: "c1", courseTitle: "Old Programme", lastClassAt: "2026-05-01T10:00:00Z" }),
      card({ slug: "none", courseId: "c3", courseTitle: "No Classes", lastClassAt: null }),
      card({ slug: "new", courseId: "c2", courseTitle: "New Programme", lastClassAt: "2026-10-01T10:00:00Z" }),
      card({ slug: "old2", courseId: "c1", courseTitle: "Old Programme", lastClassAt: "2026-12-01T10:00:00Z", state: "completed" }),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["Old Programme", "New Programme", "No Classes"]);
  });

  it("inside a group: live first, then recorded, then completed, newest class first", () => {
    const [g] = groupCardsByCourse([
      card({ slug: "done-new", state: "completed", courseId: "c1", courseTitle: "P", lastClassAt: "2026-09-01T10:00:00Z" }),
      card({ slug: "live-old", state: "live", courseId: "c1", courseTitle: "P", lastClassAt: "2026-06-01T10:00:00Z" }),
      card({ slug: "live-new", state: "live", courseId: "c1", courseTitle: "P", lastClassAt: "2026-08-01T10:00:00Z" }),
      card({ slug: "rec", state: "recorded", courseId: "c1", courseTitle: "P" }),
      card({ slug: "done-old", state: "completed", courseId: "c1", courseTitle: "P", lastClassAt: "2026-02-01T10:00:00Z" }),
    ]);
    expect(g.batches.map((b) => b.slug)).toEqual(["live-new", "live-old", "rec", "done-new", "done-old"]);
  });

  it("returns nothing for no cards", () => {
    expect(groupCardsByCourse([])).toEqual([]);
  });
});
