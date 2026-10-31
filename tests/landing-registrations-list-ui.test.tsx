// tests/landing-registrations-list-ui.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { RegistrationFilters } from "@/components/admin/registrations/RegistrationFilters";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (over: Partial<RegistrationListRow> = {}): RegistrationListRow => ({
  id: "r1", refId: "PZA-PPC-102", name: "Zainab Qasim", email: "z@x.com", pageId: "pg1", pageTitle: "PPC Masterclass",
  optionLabel: "Full course", mode: "live", region: "PK", expectedAmount: 15725, amountReceived: null, currency: "PKR",
  status: "paid", agentId: "ag1", agentName: "Sarah Jenkins", groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null,
  voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false, lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, ...over,
});
const counts = { all: 9, pending: 2, reserved: 1, underpaid: 1, paid: 4, free: 1 };
const table = (rows: RegistrationListRow[], extra: Partial<Parameters<typeof RegistrationsTable>[0]> = {}) =>
  render(
    <RegistrationsTable rows={rows} total={rows.length} pageSize={25} basePath="/dashboard/admin/enrollments/registrations"
      filters={{}} detailHrefBase="/dashboard/admin/enrollments/registrations" showAgentColumn {...extra} />,
  );

describe("registrations list UI", () => {
  it("renders a row with name, page, status and money", () => {
    table([row()]);
    const t = screen.getByRole("table");
    expect(within(t).getByText("Zainab Qasim")).toBeTruthy();
    expect(within(t).getByText("PPC Masterclass")).toBeTruthy();
    expect(within(t).getByText("Paid")).toBeTruthy();
    expect(within(t).getByText("PKR 15,725")).toBeTruthy();
    expect(within(t).getByText("Sarah Jenkins")).toBeTruthy();
    expect(within(t).getByRole("link", { name: /Zainab Qasim/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/r1");
    expect(screen.getByText("Showing 1-1 of 1")).toBeTruthy();
  });

  it("shows Test label for test rows when included", () => {
    table([row({ id: "t", name: "Tester", isTest: true }), row({ id: "n", name: "Normal" })]);
    expect(within(screen.getByRole("table")).getAllByText("Test")).toHaveLength(1);
  });

  it("shows +N members for a group lead", () => {
    table([row({ groupSize: 5 })]);
    expect(within(screen.getByRole("table")).getByText("+4 members")).toBeTruthy();
  });

  it("hides the agent column when asked", () => {
    table([row()], { showAgentColumn: false });
    expect(screen.queryByText("Sarah Jenkins")).toBeNull();
  });

  it("status tabs show counts and keep other filters in the link", () => {
    render(
      <RegistrationFilters basePath="/dashboard/admin/enrollments/registrations" filters={{ mode: "live", pageId: "pg1", q: "sara", p: 3 }}
        counts={counts} pageOptions={[{ id: "pg1", title: "PPC" }]} agentOptions={[{ id: "ag1", name: "Sarah" }]} />,
    );
    const paid = screen.getByRole("link", { name: /Paid\s*4/ });
    const href = paid.getAttribute("href") ?? "";
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(sp.get("status")).toBe("paid");
    expect(sp.get("mode")).toBe("live");
    expect(sp.get("pageId")).toBe("pg1");
    expect(sp.get("q")).toBe("sara");
    expect(sp.get("p")).toBeNull();
    expect(screen.getByRole("link", { name: /All\s*9/ })).toBeTruthy();
    expect(screen.getByLabelText("Agent")).toBeTruthy();
  });

  it("omits the Agent filter when no agent options are given", () => {
    render(<RegistrationFilters basePath="/x" filters={{}} counts={counts} pageOptions={[]} />);
    expect(screen.queryByLabelText("Agent")).toBeNull();
  });

  it("empty state when no rows", () => {
    table([], { total: 0 });
    expect(screen.getByText("No registrations match these filters")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("pager links keep filters and move by one page", () => {
    table(Array.from({ length: 25 }, (_, i) => row({ id: `r${i}` })), { total: 60, filters: { status: "paid", p: 2 } });
    expect(screen.getByText("Showing 26-50 of 60")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Previous/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations?status=paid");
    expect(screen.getByRole("link", { name: /Next/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations?status=paid&p=3");
  });

  it("tab strip links between App sign-ups and Page registrations", () => {
    render(<EnrollmentSourceTabs active="page" />);
    expect(screen.getByRole("link", { name: "App sign-ups" }).getAttribute("href")).toBe("/dashboard/admin/enrollments");
    const page = screen.getByRole("link", { name: "Page registrations" });
    expect(page.getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations");
    expect(page.getAttribute("aria-current")).toBe("page");
  });
});
