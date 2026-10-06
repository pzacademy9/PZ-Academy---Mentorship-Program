import { describe, it, expect } from "vitest";
import { hubOverviewCards } from "@/lib/crm/sales-hub-overview";

describe("hubOverviewCards", () => {
  it("builds four cards linking into the hub, warns when a number is frozen", () => {
    const cards = hubOverviewCards({ contactsTotal: 500, unassigned: 120, activeAgents: 3, frozenNumbers: 1 });
    expect(cards.map((c) => c.label)).toEqual(["Contacts", "Unassigned", "Sales agents", "Frozen numbers"]);
    expect(cards.find((c) => c.label === "Frozen numbers")?.tone).toBe("warn");
    expect(cards.find((c) => c.label === "Unassigned")?.href).toBe("/dashboard/admin/sales-hub/assign");
  });

  it("no warning when nothing is frozen", () => {
    const cards = hubOverviewCards({ contactsTotal: 0, unassigned: 0, activeAgents: 0, frozenNumbers: 0 });
    expect(cards.every((c) => c.tone === "normal")).toBe(true);
  });
});
