import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: async () => ({}) }));
vi.mock("@/lib/data/sales-agents", () => ({ listSalesAgents: async () => [] }));
vi.mock("@/lib/data/sales-assignment", () => ({ listAgentAssignmentCounts: async () => ({}) }));
vi.mock("@/components/admin/sales/AssignListsPanel", () => ({ AssignListsPanel: () => null }));
vi.mock("@/lib/data/admin-crm-import", () => ({
  listCohorts: async () => [
    { id: "a", sheetName: "A", tabName: "t", purchaseCount: 3, kind: "imported" },
    { id: "i", sheetName: "I", tabName: "t", purchaseCount: 0, kind: "closed_interested" },
  ],
}));

import AdminAssignListsPage from "@/app/dashboard/admin/sales-hub/assign/page";

type PanelProps = { cohorts: { id: string }[] };

function findPanel(node: unknown): PanelProps | null {
  if (!node || typeof node !== "object") return null;
  const el = node as ReactElement<{ cohorts?: unknown; children?: unknown }>;
  if (Array.isArray(el.props?.cohorts)) return el.props as PanelProps;
  const kids = el.props?.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const f = findPanel(k);
    if (f) return f;
  }
  return null;
}

describe("Assign Lists page", () => {
  it("does not offer interested cohorts", async () => {
    const panel = findPanel(await AdminAssignListsPage());
    expect(panel!.cohorts.map((c) => c.id)).toEqual(["a"]);
  });
});
