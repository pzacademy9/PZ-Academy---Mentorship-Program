import { describe, expect, it } from "vitest";
import {
  navForRole, toolsForRole, activeHrefFor, ADMIN_TOOLS, SALES_HUB_ITEMS, AFFILIATES_HUB_ITEMS,
} from "@/components/dashboard/nav";
import { SALES_HUB_BASE, isSalesHubPath } from "@/lib/crm/sales-hub-routes";

describe("admin tools left the main menu", () => {
  it("super admin menu has none of them", () => {
    const labels = navForRole("super_admin").map((i) => i.label);
    for (const gone of ["Payment Accounts", "Terms and Conditions", "Agent Leaderboard", "Send Notice"]) {
      expect(labels).not.toContain(gone);
    }
    expect(labels).toContain("Affiliates");
    expect(labels).toContain("Sales Hub");
    expect(labels).toContain("Settings");
    expect(labels).toContain("Notifications");
  });
});

describe("toolsForRole", () => {
  it("super admin gets both in order", () => {
    expect(toolsForRole("super_admin").map((t) => t.label)).toEqual(
      ["Payment Accounts", "Terms and Conditions"],
    );
    expect(ADMIN_TOOLS.every((t) => t.description.length > 0 && !t.description.includes("!"))).toBe(true);
  });
  it("a manager with payment_accounts gets only Payment Accounts", () => {
    expect(toolsForRole("manager", ["payment_accounts"]).map((t) => t.label)).toEqual(["Payment Accounts"]);
  });
  it("sees nothing without areas, and other roles see nothing", () => {
    expect(toolsForRole("manager", undefined)).toEqual([]);
    expect(toolsForRole("student", ["sales_hub"])).toEqual([]);
    expect(toolsForRole("mentor", ["sales_hub"])).toEqual([]);
    expect(toolsForRole("sales_agent", ["sales_hub"])).toEqual([]);
  });
  it("admin with areas gets only matching cards", () => {
    expect(toolsForRole("admin", ["terms"]).map((t) => t.label)).toEqual(["Terms and Conditions"]);
  });
});

describe("activeHrefFor aliases", () => {
  const items = navForRole("super_admin");
  it("tool pages light up Settings", () => {
    expect(activeHrefFor(items, "/dashboard/admin/terms")).toBe("/dashboard/settings");
    expect(activeHrefFor(items, "/dashboard/admin/payment-accounts")).toBe("/dashboard/settings");
  });
  it("the notice page lights up Notifications", () => {
    expect(activeHrefFor(items, "/dashboard/admin/notifications")).toBe("/dashboard/notifications");
  });
  it("an alias to a missing item yields no active item and does not crash", () => {
    expect(activeHrefFor(AFFILIATES_HUB_ITEMS, "/dashboard/admin/terms")).toBeUndefined();
  });
});

describe("hub mode keeps working", () => {
  it("isSalesHubPath is still true for the hub base", () => {
    expect(isSalesHubPath(SALES_HUB_BASE)).toBe(true);
  });
  it("the Agent Leaderboard page uses the hub menu and lights its own item", () => {
    expect(isSalesHubPath("/dashboard/admin/agent-leaderboard")).toBe(true);
    expect(activeHrefFor(SALES_HUB_ITEMS, "/dashboard/admin/agent-leaderboard")).toBe("/dashboard/admin/agent-leaderboard");
  });
  it("Sales Hub sub-pages resolve to hub items, not Settings", () => {
    expect(activeHrefFor(SALES_HUB_ITEMS, SALES_HUB_BASE)).toBe(SALES_HUB_BASE);
    expect(activeHrefFor(SALES_HUB_ITEMS, `${SALES_HUB_BASE}/contacts`)).toBe(`${SALES_HUB_BASE}/contacts`);
    expect(activeHrefFor(SALES_HUB_ITEMS, `${SALES_HUB_BASE}/import`)).toBe(`${SALES_HUB_BASE}/cohorts`);
  });
});

describe("activeHrefFor alias fallthrough", () => {
  it("a manager in normal mode on Sales Hub Import highlights Sales Hub when Cohorts is absent", () => {
    const items = navForRole("manager", ["sales_hub"]);
    expect(items.some((i) => i.href === `${SALES_HUB_BASE}/cohorts`)).toBe(false);
    expect(activeHrefFor(items, `${SALES_HUB_BASE}/import`)).toBe(SALES_HUB_BASE);
  });
});
