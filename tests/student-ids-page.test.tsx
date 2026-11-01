import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  requireAdminPage: vi.fn(),
  listPages: vi.fn(),
  listRows: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: m.requireAdminPage }));
vi.mock("@/lib/data/landing-registration-admin", () => ({ listRegistrationPageOptions: m.listPages }));
vi.mock("@/lib/data/pz-people", () => ({ listBatchIdRowsWithScope: m.listRows }));
vi.mock("@/components/admin/ids/StudentIdsPanel", () => ({ StudentIdsPanel: () => null }));

import AdminStudentIdsPage from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/ids/page";

const UUID = "00000000-0000-4000-8000-0000000000f1";
const find = (node: unknown): { pageTitle: string; rows: unknown[] } | null => {
  if (!node || typeof node !== "object") return null;
  const el = node as ReactElement<{ pageTitle?: string; rows?: unknown[]; children?: unknown }>;
  if (typeof el.props?.pageTitle === "string") return el.props as { pageTitle: string; rows: unknown[] };
  const kids = el.props?.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const f = find(k);
    if (f) return f;
  }
  return null;
};

beforeEach(() => {
  m.requireAdminPage.mockReset().mockResolvedValue({});
  m.listPages.mockReset().mockResolvedValue([{ id: UUID, title: "PPC Batch 4" }]);
  m.listRows.mockReset().mockResolvedValue([{ name: "Sample Name-0000", pzId: "Sample-0000", full: true, modules: [], known: true }]);
});

describe("Student IDs page", () => {
  it("checks the admin first", async () => {
    await AdminStudentIdsPage({ params: Promise.resolve({ pageId: UUID }) });
    expect(m.requireAdminPage).toHaveBeenCalled();
  });
  it("is not found for a bad id", async () => {
    await expect(AdminStudentIdsPage({ params: Promise.resolve({ pageId: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.listRows).not.toHaveBeenCalled();
  });
  it("is not found for an unknown batch", async () => {
    m.listPages.mockResolvedValue([]);
    await expect(AdminStudentIdsPage({ params: Promise.resolve({ pageId: UUID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("passes the title and rows to the panel", async () => {
    const panel = find(await AdminStudentIdsPage({ params: Promise.resolve({ pageId: UUID }) }));
    expect(panel?.pageTitle).toBe("PPC Batch 4");
    expect(panel?.rows).toHaveLength(1);
  });
});
