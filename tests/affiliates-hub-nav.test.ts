import { describe, it, expect } from "vitest";
import { AFFILIATES_HUB_BASE, parseAffiliatesTab, affiliatesTabHref, isAffiliatesHubPath, tabSubtitle } from "@/lib/affiliates/hub-routes";
import { AFFILIATES_HUB_ITEMS, AFFILIATES_HUB_BACK, splitMobileNav } from "@/components/dashboard/nav";

describe("affiliates hub routes", () => {
  it("reads a known tab and falls back to applications", () => {
    expect(parseAffiliatesTab("payouts")).toBe("payouts");
    expect(parseAffiliatesTab("emails")).toBe("emails");
    expect(parseAffiliatesTab("x")).toBe("applications");
    expect(parseAffiliatesTab("")).toBe("applications");
    expect(parseAffiliatesTab(undefined)).toBe("applications");
  });

  it("builds a tab link under the affiliates page", () => {
    expect(AFFILIATES_HUB_BASE).toBe("/dashboard/admin/affiliates");
    expect(affiliatesTabHref("leaderboard")).toBe("/dashboard/admin/affiliates?tab=leaderboard");
  });

  it("knows which paths are inside the hub", () => {
    expect(isAffiliatesHubPath("/dashboard/admin/affiliates")).toBe(true);
    expect(isAffiliatesHubPath("/dashboard/admin/affiliates/anything")).toBe(true);
    expect(isAffiliatesHubPath("/dashboard/admin")).toBe(false);
    expect(isAffiliatesHubPath("/dashboard/admin/affiliates-x")).toBe(false);
  });
});

describe("affiliates hub items", () => {
  it("lists the five sections in order, then the way back", () => {
    expect(AFFILIATES_HUB_ITEMS.map((i) => i.label)).toEqual(["Applications", "Affiliates", "Payouts", "Leaderboard", "Emails"]);
    expect(AFFILIATES_HUB_ITEMS.map((i) => i.href)).toEqual([
      "/dashboard/admin/affiliates?tab=applications",
      "/dashboard/admin/affiliates?tab=affiliates",
      "/dashboard/admin/affiliates?tab=payouts",
      "/dashboard/admin/affiliates?tab=leaderboard",
      "/dashboard/admin/affiliates?tab=emails",
    ]);
    expect(AFFILIATES_HUB_BACK).toMatchObject({ label: "Back to Admin", shortLabel: "Admin", href: "/dashboard/admin" });
  });

  it("the phone bar shows four items plus More, and More holds the rest including Back to Admin", () => {
    const items = [...AFFILIATES_HUB_ITEMS, AFFILIATES_HUB_BACK];
    const { bar, more } = splitMobileNav(items, items[0].href);
    expect(bar.map((i) => i.label)).toEqual(["Applications", "Affiliates", "Payouts", "Leaderboard"]);
    expect(more.map((i) => i.label)).toEqual(["Emails", "Back to Admin"]);
  });
});

describe("tab subtitles", () => {
  it("gives each of the five tabs its own sentence with no exclamation mark", () => {
    const tabs = ["applications", "affiliates", "payouts", "leaderboard", "emails"] as const;
    const subs = tabs.map((t) => tabSubtitle(t));
    expect(new Set(subs).size).toBe(5);
    for (const s of subs) {
      expect(s.length).toBeGreaterThan(10);
      expect(s).not.toContain("!");
    }
  });
});
