// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

type Res = { data: unknown; error: { message: string } | null };
const db = vi.hoisted(() => ({
  courses: (_cols: string): { data: unknown; error: { message: string } | null } => ({ data: [], error: null }),
  families: (): { data: unknown; error: { message: string } | null } => ({ data: [], error: null }),
}));

function builder(resolve: () => Res) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.order = () => b;
  b.then = (ok: (r: Res) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      if (table === "courses") {
        let cols = "";
        const b = builder(() => db.courses(cols));
        b.select = (c: string) => {
          cols = c;
          return b;
        };
        return b;
      }
      if (table === "course_families") return builder(() => db.families());
      return builder(() => ({ data: [], error: null }));
    },
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { listPrograms, type ProgramListRow } from "@/lib/data/admin-lms";
import { ProgramLibraryTable } from "@/components/admin/program/ProgramLibraryTable";

const base = { type: "course", status: "published", price_pkr: 100, is_published: true };

beforeEach(() => {
  db.courses = () => ({ data: [], error: null });
  db.families = () => ({ data: [], error: null });
});

describe("listPrograms", () => {
  it("listPrograms returns familyName and batchLabel", async () => {
    db.courses = () => ({
      data: [
        { id: "a", slug: "a", title: "A", ...base, family_id: "f1", batch_label: "Batch 3" },
        { id: "b", slug: "b", title: "B", ...base, family_id: null, batch_label: null },
      ],
      error: null,
    });
    db.families = () => ({ data: [{ id: "f1", name: "PPC" }], error: null });
    const { rows } = await listPrograms();
    expect(rows[0]).toMatchObject({ familyName: "PPC", batchLabel: "Batch 3" });
    expect(rows[1]).toMatchObject({ familyName: null, batchLabel: null });
  });

  it("still returns rows when the new columns are missing", async () => {
    db.courses = (cols) =>
      cols.includes("family_id")
        ? { data: null, error: { message: "column does not exist" } }
        : { data: [{ id: "a", slug: "a", title: "A", ...base }], error: null };
    db.families = () => ({ data: null, error: { message: "relation does not exist" } });
    const { rows } = await listPrograms();
    expect(rows).toHaveLength(1);
    expect(rows[0].familyName).toBeNull();
    expect(rows[0].batchLabel).toBeNull();
  });
});

function row(over: Partial<ProgramListRow>): ProgramListRow {
  return {
    id: "x",
    slug: "x",
    title: "X",
    type: "course",
    status: "open",
    pricePkr: 100,
    isPublished: true,
    sessionCount: 0,
    enrollmentCount: 0,
    familyName: null,
    batchLabel: null,
    ...over,
  };
}

describe("ProgramLibraryTable grouping", () => {
  it("rows with a family render under a heading with the family name, batch label shown beside the title", () => {
    render(
      <ProgramLibraryTable
        rows={[
          row({ id: "1", slug: "ppc-3", title: "PPC Z", familyName: "PPC", batchLabel: "Batch 3" }),
          row({ id: "2", slug: "ppc-2", title: "PPC A", familyName: "PPC", batchLabel: "Batch 2" }),
          row({ id: "3", slug: "dit", title: "DIT", familyName: "Diploma", batchLabel: "Batch 1" }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.indexOf("Diploma")).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf("Diploma")).toBeLessThan(headings.indexOf("PPC"));
    const group = screen.getByTestId("family-group-PPC");
    const titles = within(group).getAllByTestId("family-row-title").map((t) => t.textContent);
    expect(titles[0]).toContain("PPC A");
    expect(titles[0]).toContain("Batch 2");
    expect(titles[1]).toContain("PPC Z");
  });

  it("rows without a family stay in the normal list, unchanged", () => {
    render(<ProgramLibraryTable rows={[row({ id: "1", title: "Solo Course" })]} />);
    expect(screen.queryByTestId(/^family-group-/)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Courses" })).toBeTruthy();
    expect(screen.getAllByText("Solo Course").length).toBeGreaterThan(0);
  });
});
