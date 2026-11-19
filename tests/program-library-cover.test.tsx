import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ProgramLibraryTable } from "@/components/admin/program/ProgramLibraryTable";
import { CoverThumb } from "@/components/ui/CoverThumb";
import type { ProgramListRow } from "@/lib/data/admin-lms";

const SUPA = "https://abcdefgh.supabase.co";
const COVER = `${SUPA}/storage/v1/object/public/media/a.png`;

// listPrograms has no test harness (it reads Supabase directly), so the
// thumbnail_url -> thumbnailUrl mapping is covered through these UI rows.
function row(over: Partial<ProgramListRow>): ProgramListRow {
  return {
    id: "c1",
    slug: "alpha",
    title: "Zeta Course",
    type: "course",
    status: "published",
    pricePkr: 1000,
    isPublished: true,
    sessionCount: 0,
    enrollmentCount: 0,
    thumbnailUrl: null,
    ...over,
  } as ProgramListRow;
}

describe("ProgramLibraryTable covers", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  });

  it("shows the cover image in both the table and the phone card", () => {
    const { container } = render(<ProgramLibraryTable rows={[row({ thumbnailUrl: COVER })]} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    imgs.forEach((i) => expect(i.getAttribute("src")).toBe(COVER));
  });

  it("shows the placeholder and still links to the program when there is no cover", () => {
    const { container } = render(<ProgramLibraryTable rows={[row({ thumbnailUrl: null })]} />);
    expect(container.querySelector("img")).toBeNull();
    const letters = Array.from(container.querySelectorAll("span")).filter((e) => e.textContent === "Z");
    expect(letters.length).toBe(2);
    const links = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "/dashboard/admin/courses/c1",
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("lets a passed className override the default rounding", () => {
    const { container } = render(<CoverThumb url={null} title="x" className="w-16 rounded-md" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("rounded-md");
    expect(root.className).not.toContain("rounded-t-xl");
  });
});
