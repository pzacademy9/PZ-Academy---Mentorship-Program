// tests/landing-recent-registration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { findRecentRegistration } from "@/lib/data/landing-registrations";

beforeEach(() => db.reset());

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1", page_id: "page-1", row_type: "individual", ref_id: "PZA-PPC-001", email: "ayesha@example.com", status: "pending",
  option_keys: ["full"], mode: "live", tier_key: "individual", group_size: 1, option_label: "Live - Full Course - Individual",
  expected_amount: 4800, currency: "PKR", event_id: "evt-1", is_test: false, created_at: "2026-10-13T09:50:00.000Z", ...over,
});

describe("findRecentRegistration", () => {
  it("returns the newest real lead or individual row for this page and email since the cut-off", async () => {
    db.state.handler = memoryHandler({
      landing_registrations: [
        row({ id: "old", ref_id: "PZA-PPC-001", created_at: "2026-10-13T09:40:00.000Z" }),
        row({ id: "new", ref_id: "PZA-PPC-002", row_type: "lead", tier_key: "g3", group_size: 3, expected_amount: 11500, created_at: "2026-10-13T09:58:00.000Z" }),
        row({ id: "mem", ref_id: null, row_type: "member", created_at: "2026-10-13T09:59:00.000Z" }),
        row({ id: "tst", ref_id: "TEST-12345", is_test: true, created_at: "2026-10-13T09:59:30.000Z" }),
        row({ id: "other", ref_id: "PZA-MDC-001", page_id: "page-2", created_at: "2026-10-13T09:59:40.000Z" }),
      ],
    });
    expect(await findRecentRegistration("page-1", " Ayesha@Example.com ", "2026-10-13T09:45:00.000Z")).toEqual({
      refId: "PZA-PPC-002", status: "pending", optionKeys: ["full"], mode: "live", tierKey: "g3", groupSize: 3,
      optionLabel: "Live - Full Course - Individual", expectedAmount: 11500, currency: "PKR", eventId: "evt-1",
    });
    const op = db.find("landing_registrations", "select")[0];
    expect(filterValue(op, "eq", "email")).toBe("ayesha@example.com");
    expect(filterValue(op, "gte", "created_at")).toBe("2026-10-13T09:45:00.000Z");
    expect(filterValue(op, "eq", "is_test")).toBe(false);
  });
  it("is null when nothing is that recent", async () => {
    db.state.handler = memoryHandler({ landing_registrations: [row()] });
    expect(await findRecentRegistration("page-1", "ayesha@example.com", "2026-10-13T10:00:00.000Z")).toBeNull();
  });
  it("fails open (null) on a read error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    expect(await findRecentRegistration("page-1", "ayesha@example.com", "2026-10-13T09:45:00.000Z")).toBeNull();
  });
});
