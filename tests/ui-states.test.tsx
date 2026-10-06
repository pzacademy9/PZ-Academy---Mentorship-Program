import { render, screen, fireEvent } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ChipTabs } from "@/components/ui/chip-tabs";

it("EmptyState renders title, description and a link action", () => {
  render(<EmptyState icon={Inbox} title="No contacts yet" description="Import a sheet."
    action={{ label: "Import contacts", href: "/dashboard/admin/sales-hub/import" }} />);
  expect(screen.getByRole("heading", { name: "No contacts yet" })).toBeTruthy();
  expect(screen.getByText("Import a sheet.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Import contacts" }).getAttribute("href"))
    .toBe("/dashboard/admin/sales-hub/import");
});

it("EmptyState renders a button action that calls onClick", () => {
  const onClick = vi.fn();
  render(<EmptyState icon={Inbox} title="Empty" action={{ label: "Create", onClick }} />);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it("ErrorState retry calls onRetry and offers a home link", () => {
  const onRetry = vi.fn();
  render(<ErrorState onRetry={onRetry} />);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: /go to dashboard/i }).getAttribute("href")).toBe("/dashboard");
});

it("ChipTabs renders a labelled scroll row that does not wrap on mobile", () => {
  render(<ChipTabs label="CRM sections"><a href="#a" aria-current="page">A</a><a href="#b">B</a></ChipTabs>);
  const nav = screen.getByRole("navigation", { name: "CRM sections" });
  const row = nav.querySelector("[data-chip-row]") as HTMLElement;
  expect(row.className).toContain("overflow-x-auto");
  expect(row.className).toContain("max-md:flex-nowrap");
  expect(row.className).toContain("max-md:[&>*]:min-h-11");
});
