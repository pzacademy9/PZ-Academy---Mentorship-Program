// tests/landing-registrations-list-ui.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { RegistrationFilters } from "@/components/admin/registrations/RegistrationFilters";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (over: Partial<RegistrationListRow> = {}): RegistrationListRow => ({
  id: "r1", refId: "PZA-PPC-102", name: "Zainab Qasim", email: "z@x.com", pageId: "pg1", pageTitle: "PPC Masterclass",
  optionLabel: "Full course", mode: "live", region: "PK", expectedAmount: 15725, amountReceived: null, currency: "PKR",
  status: "paid", agentId: "ag1", agentName: "Sarah Jenkins", groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null,
  voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false, lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, groupId: null, ...over,
});
const counts = { all: 9, pending: 2, reserved: 1, underpaid: 1, paid: 4, free: 1 };
const table = (rows: RegistrationListRow[], extra: Partial<Parameters<typeof RegistrationsTable>[0]> = {}) =>
  render(
    <RegistrationsTable rows={rows} total={rows.length} basePath="/dashboard/admin/enrollments/registrations"
      detailHrefBase="/dashboard/admin/enrollments/registrations" showAgentColumn {...extra} />,
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
    expect(screen.getByText("Showing all 1")).toBeTruthy();
  });

  it("shows Test label for test rows when included", () => {
    table([row({ id: "t", name: "Tester", isTest: true }), row({ id: "n", name: "Normal" })]);
    expect(within(screen.getByRole("table")).getAllByText("Test")).toHaveLength(1);
  });

  it("shows +N members for a group lead", () => {
    table([row({ groupSize: 5 })]);
    expect(within(screen.getByRole("table")).getByText("+4 members")).toBeTruthy();
  });

  const memberRow = () => row({ id: "m1", refId: null, name: "Bilal Ahmed", email: "b@x.com", groupSize: 1, rowType: "member", leadId: "r1", leadName: "Zainab Qasim" });
  const selectable = { isSelected: () => false, onToggle: () => {}, allOnPageSelected: false, onTogglePage: () => {} };

  it("a member row shows 'Group member of <lead name>' under the name and its own tick-box", () => {
    table([memberRow()], { selectable });
    expect(within(screen.getByRole("table")).getByText("Group member of Zainab Qasim")).toBeTruthy();
    expect(within(screen.getByTestId("responsive-cards")).getByText("Group member of Zainab Qasim")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByRole("checkbox", { name: "Select Bilal Ahmed" })).toBeTruthy();
  });

  it("a member row with no lead name shows 'Group member' with no dangling 'of'", () => {
    table([{ ...memberRow(), leadName: null }]);
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Group member")).toBeTruthy();
    expect(t.queryByText(/Group member of/)).toBeNull();
  });

  it("a member row links to the lead's detail page, other rows to their own id", () => {
    table([memberRow(), row({ id: "r9", name: "Imran Khan", groupSize: 3, rowType: "lead" })]);
    const t = within(screen.getByRole("table"));
    expect(t.getByRole("link", { name: /Bilal Ahmed/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/r1");
    expect(t.getByRole("link", { name: /Imran Khan/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/r9");
  });

  it("a member row has no '+N members' tag, a lead row keeps it", () => {
    table([row({ id: "m2", rowType: "member", leadId: "r1", leadName: "Zainab Qasim", groupSize: 4 })]);
    expect(within(screen.getByRole("table")).queryByText("+3 members")).toBeNull();
    cleanup();
    table([row({ rowType: "lead", groupSize: 4 })]);
    expect(within(screen.getByRole("table")).getByText("+3 members")).toBeTruthy();
  });

  it("the sales table shows no member line for lead or individual rows", () => {
    table([row(), row({ id: "r2", rowType: "lead", groupSize: 2 })], { showAgentColumn: false });
    expect(screen.queryByText(/Group member of/)).toBeNull();
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

  it("shows every row at once with no pager", () => {
    table(Array.from({ length: 60 }, (_, i) => row({ id: `r${i}`, name: `Person ${i}` })));
    expect(screen.getByText("Showing all 60")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Person 59")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Next/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Previous/ })).toBeNull();
  });

  it("a group's lead and members share a highlight; single registrations do not, and only the first row of a group gets the top divider", () => {
    const lead = row({ id: "L", name: "Lead One", rowType: "lead", groupSize: 3, groupId: "L" });
    const m1 = row({ id: "m1", name: "Mem One", rowType: "member", leadId: "L", leadName: "Lead One", groupId: "L" });
    const m2 = row({ id: "m2", name: "Mem Two", rowType: "member", leadId: "L", leadName: "Lead One", groupId: "L" });
    const solo = row({ id: "s", name: "Solo Person" });
    table([lead, m1, m2, solo]);
    const trOf = (name: string) => within(screen.getByRole("table")).getByText(name).closest("tr")!;
    for (const n of ["Lead One", "Mem One", "Mem Two"]) expect(trOf(n).className).toContain("bg-pz-primary-fixed/25");
    expect(trOf("Solo Person").className).not.toContain("bg-pz-primary-fixed/25");
    expect(trOf("Lead One").className).toContain("border-t-pz-primary");
    expect(trOf("Mem One").className).not.toContain("border-t-pz-primary");
    const cards = within(screen.getByTestId("responsive-cards")).getAllByRole("listitem");
    expect(cards.map((c) => c.className.includes("bg-pz-primary-fixed/25"))).toEqual([true, true, true, false]);
  });

  it("tab strip links between App sign-ups and Page registrations", () => {
    render(<EnrollmentSourceTabs active="page" />);
    expect(screen.getByRole("link", { name: "App sign-ups" }).getAttribute("href")).toBe("/dashboard/admin/enrollments");
    const page = screen.getByRole("link", { name: "Page registrations" });
    expect(page.getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations");
    expect(page.getAttribute("aria-current")).toBe("page");
  });
});
