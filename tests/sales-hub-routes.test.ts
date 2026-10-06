import { SALES_HUB_BASE, hubPath, legacyCrmTabTarget, isSalesHubPath } from "@/lib/crm/sales-hub-routes";

it("hubPath joins under the base", () => {
  expect(SALES_HUB_BASE).toBe("/dashboard/admin/sales-hub");
  expect(hubPath("contacts")).toBe("/dashboard/admin/sales-hub/contacts");
});

it("maps every legacy CRM tab to a hub route", () => {
  for (const t of ["contacts", "import", "merge", "campaigns", "cohorts", "whatsapp", "conversion"]) {
    expect(legacyCrmTabTarget(t)).toBe(`/dashboard/admin/sales-hub/${t}`);
  }
});

it("legacy agents tab lands on the overview, unknown or missing tab on contacts", () => {
  expect(legacyCrmTabTarget("agents")).toBe("/dashboard/admin/sales-hub");
  expect(legacyCrmTabTarget(undefined)).toBe("/dashboard/admin/sales-hub/contacts");
  expect(legacyCrmTabTarget("nonsense")).toBe("/dashboard/admin/sales-hub/contacts");
});

it("isSalesHubPath matches the base and children only", () => {
  expect(isSalesHubPath("/dashboard/admin/sales-hub")).toBe(true);
  expect(isSalesHubPath("/dashboard/admin/sales-hub/contacts/abc")).toBe(true);
  expect(isSalesHubPath("/dashboard/admin/sales-hubx")).toBe(false);
  expect(isSalesHubPath("/dashboard/admin")).toBe(false);
  expect(isSalesHubPath("")).toBe(false);
});
