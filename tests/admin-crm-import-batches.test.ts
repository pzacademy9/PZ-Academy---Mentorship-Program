import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("server-only", () => ({}));

import { listImportBatches } from "@/lib/data/admin-crm-import";

beforeEach(() => db.reset());

const b = (id: string, kind: string) => ({
  id, sheet_name: `S ${id}`, tab_name: "t", rows_imported: 1, created_at: "2026-01-01T00:00:00Z", kind,
});

describe("listImportBatches", () => {
  it("leaves out interested cohorts, which have no purchases to filter by", async () => {
    db.state.handler = memoryHandler({
      import_batches: [b("a", "imported"), b("p", "closed_paid"), b("i", "closed_interested")],
    });
    const rows = await listImportBatches();
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "p"]);
  });
});
