import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CohortsTabs } from "@/components/admin/crm/CohortsTabs";

describe("CohortsTabs", () => {
  it("has three links to the right places", () => {
    render(<CohortsTabs active="cohorts" />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Cohorts", "/dashboard/admin/sales-hub/cohorts"],
      ["Import a sheet", "/dashboard/admin/sales-hub/import"],
      ["Merge review", "/dashboard/admin/sales-hub/merge"],
    ]);
  });

  it.each([["cohorts", "Cohorts"], ["import", "Import a sheet"], ["merge", "Merge review"]] as const)(
    "marks only %s as the current page",
    (active, label) => {
      render(<CohortsTabs active={active} />);
      const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
      expect(current.map((l) => l.textContent)).toEqual([label]);
    },
  );
});
