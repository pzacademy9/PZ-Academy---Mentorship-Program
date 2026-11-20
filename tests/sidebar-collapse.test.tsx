import { render, within, fireEvent } from "@testing-library/react";
import { vi, it, expect, beforeEach, afterEach } from "vitest";

let path = "/dashboard/admin/enrollments";
vi.mock("next/navigation", () => ({ usePathname: () => path, useSearchParams: () => new URLSearchParams() }));

import { Sidebar } from "@/components/dashboard/Sidebar";

const KEY = "pz.sidebar.collapsed";

function desktop(container: HTMLElement) {
  return container.querySelector("aside") as HTMLElement;
}

beforeEach(() => {
  path = "/dashboard/admin/enrollments";
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("is expanded by default with visible labels", () => {
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  expect(aside.className).toContain("w-60");
  expect(within(aside).getByText("Enrollments")).toBeTruthy();
  const toggle = within(aside).getByRole("button", { name: "Collapse menu" });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

it("toggle hides text labels, keeps accessible names, and saves 1", () => {
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  fireEvent.click(within(aside).getByRole("button", { name: "Collapse menu" }));
  expect(aside.className).toContain("w-16");
  expect(within(aside).queryByText("Enrollments")).toBeNull();
  const link = within(aside).getByRole("link", { name: "Enrollments" });
  expect(link.getAttribute("title")).toBe("Enrollments");
  expect(window.localStorage.getItem(KEY)).toBe("1");
  fireEvent.click(within(aside).getByRole("button", { name: "Expand menu" }));
  expect(window.localStorage.getItem(KEY)).toBe("0");
  expect(within(aside).getByText("Enrollments")).toBeTruthy();
});

it("mounts collapsed when storage says 1", () => {
  window.localStorage.setItem(KEY, "1");
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  expect(aside.className).toContain("w-16");
  expect(within(aside).getByRole("button", { name: "Expand menu" }).getAttribute("aria-expanded")).toBe("false");
});

it("stays expanded and does not crash when storage throws", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  expect(aside.className).toContain("w-60");
  fireEvent.click(within(aside).getByRole("button", { name: "Collapse menu" }));
  expect(aside.className).toContain("w-16");
});

it("toggle works from the keyboard", () => {
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  const toggle = within(aside).getByRole("button", { name: "Collapse menu" });
  toggle.focus();
  expect(document.activeElement).toBe(toggle);
  // A native button turns Enter into a click, so click stands in for it here.
  expect(toggle.tagName).toBe("BUTTON");
  fireEvent.click(document.activeElement as HTMLElement);
  expect(within(aside).getByRole("button", { name: "Expand menu" }).getAttribute("aria-expanded")).toBe("false");
});

it("hub mode collapsed hides group headings and keeps Back to Admin named", () => {
  path = "/dashboard/admin/sales-hub/contacts";
  window.localStorage.setItem(KEY, "1");
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  expect(within(aside).queryByText("Audience")).toBeNull();
  expect(within(aside).queryByText("Outreach")).toBeNull();
  expect(within(aside).queryByText("Sales Hub")).toBeNull();
  expect(within(aside).getByRole("link", { name: "Back to Admin" })).toBeTruthy();
});

it("aside stays in view and the toggle sits outside the scrolling nav", () => {
  const { container } = render(<Sidebar role="admin" />);
  const aside = desktop(container);
  for (const c of ["lg:sticky", "lg:top-0", "lg:h-screen"]) expect(aside.className).toContain(c);
  const nav = aside.querySelector("nav") as HTMLElement;
  expect(nav.className).toContain("overflow-y-auto");
  const toggle = within(aside).getByRole("button", { name: "Collapse menu" });
  expect(nav.contains(toggle)).toBe(false);
});
