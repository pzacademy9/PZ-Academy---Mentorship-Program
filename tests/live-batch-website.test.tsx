import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LiveBatchBanner } from "@/components/marketing/LiveBatchBanner";
import { OpenBatchStrip } from "@/components/marketing/OpenBatchStrip";
import { CourseCard } from "@/components/marketing/CourseCard";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

afterEach(cleanup);

const course = (over: Partial<CourseCardData> = {}): CourseCardData => ({
  id: "c1", slug: "ppc", title: "PPC", type: "course", status: "open", tagline: null, thumbnailUrl: null,
  level: null, durationLabel: null, pricePkr: 1000, mentorName: null, mentorTitle: null, mentorAvatarUrl: null,
  publicVideoUrl: null, ...over,
});
const batch = (id: string, over = {}) => ({ courseId: id, slug: `s-${id}`, title: `Course ${id}`, startsOn: "30 October 2026", href: `/e/s-${id}?src=website`, ...over });

describe("LiveBatchBanner", () => {
  it("shows the label, start date and a link to the exact href", () => {
    render(<LiveBatchBanner title="PPC" startsOn="30 October 2026" href="/e/ppc?src=website" />);
    expect(screen.getByText("Live batch open")).toBeTruthy();
    expect(screen.getByText("Starts 30 October 2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Register for live: PPC" }).getAttribute("href")).toBe("/e/ppc?src=website");
    expect(screen.getByRole("region", { name: "Live batch" })).toBeTruthy();
  });
  it("omits the date line when startsOn is empty", () => {
    render(<LiveBatchBanner title="PPC" startsOn="" href="/e/ppc?src=website" />);
    expect(screen.queryByText(/Starts/)).toBeNull();
  });
});

describe("CourseCard tag", () => {
  it("shows the tag only with liveBatch", () => {
    const { rerender } = render(<CourseCard course={course()} />);
    expect(screen.queryByText("Live batch open")).toBeNull();
    rerender(<CourseCard course={course({ liveBatch: { startsOn: "", href: "/e/x?src=website" } })} />);
    expect(screen.getByText("Live batch open")).toBeTruthy();
  });
});

describe("CourseCatalogGrid", () => {
  it("passes liveBatch through to cards", () => {
    render(<CourseCatalogGrid courses={[course({ liveBatch: { startsOn: "", href: "/e/x?src=website" } }), course({ id: "c2", title: "Other" })]} />);
    expect(screen.getAllByText("Live batch open")).toHaveLength(1);
  });
});

describe("attachLiveBatches", () => {
  it("attaches by course id and leaves others alone", () => {
    const out = attachLiveBatches([course(), course({ id: "c2" })], new Map([["c1", batch("c1")]]));
    expect(out[0].liveBatch).toEqual({ startsOn: "30 October 2026", href: "/e/s-c1?src=website" });
    expect(out[1].liveBatch).toBeUndefined();
  });
  it("returns courses unchanged for an empty map", () => {
    const cs = [course()];
    expect(attachLiveBatches(cs, new Map())).toEqual(cs);
  });
});

describe("OpenBatchStrip", () => {
  it("renders nothing for no batches", () => {
    const { container } = render(<OpenBatchStrip batches={[]} />);
    expect(container.innerHTML).toBe("");
  });
  it("lists at most 3 batches with title, date and link", () => {
    render(<OpenBatchStrip batches={[1, 2, 3, 4].map((n) => batch(String(n)))} />);
    expect(screen.getAllByRole("link", { name: /^Register for live: Course/ })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Register for live: Course 2" })).toBeTruthy();
    expect(screen.getByText("Course 1")).toBeTruthy();
    expect(screen.queryByText("Course 4")).toBeNull();
    expect(screen.getAllByText("Starts 30 October 2026")).toHaveLength(3);
  });
});
