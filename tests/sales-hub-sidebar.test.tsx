import { render, screen } from "@testing-library/react";
import { vi, it, expect } from "vitest";

let path = "/dashboard/admin/sales-hub/contacts";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

import { Sidebar } from "@/components/dashboard/Sidebar";

it("admin inside the hub sees the Sales menu with group headings and a way back", () => {
  path = "/dashboard/admin/sales-hub/contacts";
  render(<Sidebar role="admin" />);
  expect(screen.getAllByText("Audience").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Outreach").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: /Back to Admin/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "Enrollments" })).toBeNull();
});

it("admin outside the hub sees the normal menu with one Sales Hub link", () => {
  path = "/dashboard/admin/enrollments";
  render(<Sidebar role="admin" />);
  expect(screen.getAllByRole("link", { name: "Sales Hub" }).length).toBeGreaterThan(0);
  expect(screen.queryByText("Audience")).toBeNull();
});

it("non-admin never gets hub mode even on a hub path", () => {
  path = "/dashboard/admin/sales-hub";
  render(<Sidebar role="mentor" />);
  expect(screen.queryByText("Audience")).toBeNull();
});

it("desktop menu shows each group heading exactly once despite interleaved items", () => {
  path = "/dashboard/admin/sales-hub/contacts";
  const { container } = render(<Sidebar role="admin" />);
  const desktop = container.querySelector("aside") as HTMLElement;
  const headings = Array.from(desktop.querySelectorAll("p")).map((p) => p.textContent);
  for (const g of ["Audience", "Outreach", "Team"]) {
    expect(headings.filter((h) => h === g)).toHaveLength(1);
  }
  expect(headings).not.toContain("Overview");
  expect(headings.indexOf("Audience")).toBeLessThan(headings.indexOf("Outreach"));
  expect(headings.indexOf("Outreach")).toBeLessThan(headings.indexOf("Team"));
});
