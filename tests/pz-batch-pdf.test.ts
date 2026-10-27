import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const people = vi.hoisted(() => ({ listBatchIdsForAdmin: vi.fn() }));
vi.mock("@/lib/data/pz-people", () => ({ listBatchIdsForAdmin: people.listBatchIdsForAdmin }));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: auth.requireAdmin }));

import { buildBatchPdf, renderBatchPdf } from "@/lib/pzid/batch-pdf";
import { getBatchIdList } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}`, pzId: `Person-${1000 + i}` }));

describe("buildBatchPdf", () => {
  it("returns a non-empty PDF blob", () => {
    const blob = buildBatchPdf("PPC Batch 3", rows(3));
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
  it("breaks onto more pages for 200 rows and stays on one for 3", () => {
    expect(renderBatchPdf("PPC Batch 3", rows(3)).getNumberOfPages()).toBe(1);
    expect(renderBatchPdf("PPC Batch 3", rows(200)).getNumberOfPages()).toBeGreaterThan(1);
    expect(buildBatchPdf("B", rows(200)).size).toBeGreaterThan(buildBatchPdf("B", rows(3)).size);
  });
});

describe("getBatchIdList", () => {
  beforeEach(() => {
    people.listBatchIdsForAdmin.mockReset();
    auth.requireAdmin.mockReset();
  });
  it("returns names and IDs without emails", async () => {
    auth.requireAdmin.mockResolvedValue({ ok: true });
    people.listBatchIdsForAdmin.mockResolvedValue([{ name: "Hamid", email: "h@x.com", pzId: "Hamid-4821" }]);
    const out = await getBatchIdList("pg1");
    expect(out).toEqual([{ name: "Hamid", pzId: "Hamid-4821" }]);
    expect(Object.keys(out[0])).not.toContain("email");
  });
  it("refuses a caller who is not an admin", async () => {
    auth.requireAdmin.mockResolvedValue({ ok: false });
    await expect(getBatchIdList("pg1")).rejects.toThrow();
    expect(people.listBatchIdsForAdmin).not.toHaveBeenCalled();
  });
});
