import { render, screen, within, fireEvent } from "@testing-library/react";
import { vi, it, expect } from "vitest";

let path = "/dashboard/admin/affiliates";
let query = "tab=payouts";
vi.mock("next/navigation", () => ({ usePathname: () => path, useSearchParams: () => new URLSearchParams(query) }));

import { Sidebar } from "@/components/dashboard/Sidebar";

const side = (c: HTMLElement) => within(c.querySelector("aside") as HTMLElement);
const bottom = (c: HTMLElement) => within(c.querySelector('nav[aria-label="Main"]') as HTMLElement);

it("admin inside Affiliates sees the five sections and a way back, not the normal menu", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=payouts";
  const { container } = render(<Sidebar role="admin" />);
  const d = side(container);
  for (const name of ["Applications", "Affiliates", "Payouts", "Leaderboard", "Emails"]) {
    expect(d.getByRole("link", { name })).toBeTruthy();
  }
  expect(d.getByRole("link", { name: /Back to Admin/ })).toBeTruthy();
  expect(d.queryByRole("link", { name: "Enrollments" })).toBeNull();
  expect(d.queryByRole("link", { name: "Sales Hub" })).toBeNull();
});

it("the section in the address is marked current and the others are not", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=payouts";
  const { container } = render(<Sidebar role="admin" />);
  const bar = bottom(container);
  expect(bar.getByRole("link", { name: "Payouts" }).getAttribute("aria-current")).toBe("page");
  expect(bar.getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBeNull();
  const d = side(container);
  expect(d.getByRole("link", { name: "Payouts" }).className).toContain("font-bold");
  expect(d.getByRole("link", { name: "Applications" }).className).not.toContain("font-bold");
});

it("a missing or mistyped tab marks Applications current", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=nonsense";
  const { container } = render(<Sidebar role="admin" />);
  expect(bottom(container).getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBe("page");
});

it("the phone bar shows four items plus More, and More lists the rest", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=applications";
  const { container } = render(<Sidebar role="admin" />);
  const bar = bottom(container);
  expect(bar.getAllByRole("link").map((l) => l.textContent)).toEqual(["Applications", "Affiliates", "Payouts", "Leaderboard"]);
  fireEvent.click(bar.getByRole("button", { name: /More/ }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("link", { name: "Emails" })).toBeTruthy();
  expect(dialog.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/dashboard/admin");
});

it("outside Affiliates the normal admin menu shows", () => {
  path = "/dashboard/admin/courses";
  query = "";
  const { container } = render(<Sidebar role="admin" />);
  const d = side(container);
  expect(d.getByRole("link", { name: "Affiliates" }).getAttribute("href")).toBe("/dashboard/admin/affiliates");
  expect(d.queryByRole("link", { name: "Payouts" })).toBeNull();
});

it("a manager with the sales_hub area gets the hub, one without does not", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=emails";
  const a = render(<Sidebar role="manager" areas={["sales_hub"]} />);
  expect(side(a.container).getByRole("link", { name: "Payouts" })).toBeTruthy();
  a.unmount();
  const b = render(<Sidebar role="manager" areas={["students"]} />);
  expect(side(b.container).queryByRole("link", { name: "Payouts" })).toBeNull();
});

it("people who cannot see Affiliates never get hub mode", () => {
  path = "/dashboard/admin/affiliates";
  query = "tab=payouts";
  const { container } = render(<Sidebar role="mentor" />);
  expect(side(container).queryByRole("link", { name: "Payouts" })).toBeNull();
});
