import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchToolsMenu } from "@/components/admin/registrations/BatchToolsMenu";

const BASE = "/dashboard/admin/enrollments/registrations";

function open() {
  render(<BatchToolsMenu pageId="p1" base={BASE} />);
  fireEvent.keyDown(screen.getByRole("button", { name: /Batch tools/ }), { key: "Enter" });
}

describe("BatchToolsMenu", () => {
  it("shows the Batch tools button", () => {
    render(<BatchToolsMenu pageId="p1" base={BASE} />);
    expect(screen.getByRole("button", { name: /Batch tools/ })).toBeTruthy();
  });

  it("opens five links in order with the right hrefs", () => {
    open();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Sheet sync", "Classes", "Student IDs", "Progress reports", "Portal access",
    ]);
    expect(items.map((i) => i.getAttribute("href"))).toEqual([
      `${BASE}/sheet/p1`,
      `${BASE}/campaign/p1/sessions`,
      `${BASE}/campaign/p1/ids`,
      `${BASE}/campaign/p1/reports`,
      `${BASE}/campaign/p1/portal`,
    ]);
    expect(screen.getByText("Cohort operations")).toBeTruthy();
  });

  it("closes on Escape", () => {
    open();
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Escape" });
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});
