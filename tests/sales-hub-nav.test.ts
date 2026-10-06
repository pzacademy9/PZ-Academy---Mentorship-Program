import { SALES_HUB_ITEMS, SALES_HUB_BACK, navForRole, activeHrefFor, splitMobileNav } from "@/components/dashboard/nav";

it("hub menu has the agreed items in order, grouped", () => {
  expect(SALES_HUB_ITEMS.map((i) => i.label)).toEqual([
    "Overview", "Contacts", "Assign Lists", "Sales Team",
    "Import", "Merge Review", "Cohorts", "Campaigns", "WhatsApp Batches", "Conversion", "WhatsApp Safety",
  ]);
  const groups = Object.fromEntries(SALES_HUB_ITEMS.map((i) => [i.label, i.group]));
  expect(groups["Contacts"]).toBe("Audience");
  expect(groups["Campaigns"]).toBe("Outreach");
  expect(groups["Assign Lists"]).toBe("Team");
  expect(groups["Overview"]).toBe("Overview");
});

it("every hub item is admin-only and lives under the hub", () => {
  for (const i of SALES_HUB_ITEMS) {
    expect(i.href.startsWith("/dashboard/admin/sales-hub")).toBe(true);
    expect(i.roles).toEqual(["admin", "super_admin"]);
  }
  expect(SALES_HUB_BACK.href).toBe("/dashboard/admin");
});

it("detail pages highlight their list item; overview does not swallow them", () => {
  const items = SALES_HUB_ITEMS;
  expect(activeHrefFor(items, "/dashboard/admin/sales-hub/contacts/abc")).toBe("/dashboard/admin/sales-hub/contacts");
  expect(activeHrefFor(items, "/dashboard/admin/sales-hub")).toBe("/dashboard/admin/sales-hub");
});

it("mobile bar shows Overview, Contacts, Assign Lists, Sales Team; the rest is under More", () => {
  const { bar, more } = splitMobileNav([...SALES_HUB_ITEMS, SALES_HUB_BACK], undefined);
  expect(bar.map((i) => i.label)).toEqual(["Overview", "Contacts", "Assign Lists", "Sales Team"]);
  expect(more[more.length - 1].label).toBe("Back to Admin");
});

it("main admin nav has one Sales Hub entry and no CRM / Sales Team / Safety entries", () => {
  const labels = navForRole("admin").map((i) => i.label);
  expect(labels).toContain("Sales Hub");
  for (const gone of ["CRM", "Sales Team", "WhatsApp Safety"]) expect(labels).not.toContain(gone);
  expect(navForRole("sales_agent").map((i) => i.label)).not.toContain("Sales Hub");
  expect(navForRole("mentor").map((i) => i.label)).not.toContain("Sales Hub");
});
