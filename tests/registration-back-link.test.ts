import { describe, expect, it } from "vitest";
import { backTarget, detailSuffix, listAddress } from "@/lib/registrations/back-link";

const CAMPAIGN = "/dashboard/admin/enrollments/registrations/campaign/abc";

describe("registration back link", () => {
  it("keeps the filters of the list the person came from", () => {
    const list = listAddress(CAMPAIGN, { status: "paid", q: "ali", mode: undefined, p: 2 });
    expect(list).toBe(`${CAMPAIGN}?status=paid&q=ali&p=2`);
    const from = new URLSearchParams(detailSuffix(list)).get("from");
    expect(backTarget(from ?? undefined)).toBe(list);
  });
  it("an unfiltered list is just its own address", () => {
    expect(listAddress(CAMPAIGN, { status: "all", p: 1 })).toBe(CAMPAIGN);
  });
  it("falls back to All registrations when from is missing or not ours", () => {
    const all = "/dashboard/admin/enrollments/registrations/all";
    expect(backTarget(undefined)).toBe(all);
    expect(backTarget("https://evil.example")).toBe(all);
    expect(backTarget("//evil.example")).toBe(all);
    expect(backTarget("/dashboard/admin/enrollments/registrations//evil.example")).toBe(all);
    expect(backTarget("/dashboard/settings")).toBe(all);
  });
});
