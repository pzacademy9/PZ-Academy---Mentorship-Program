import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueSheetStatus: vi.fn(), enqueueStatusEffects: vi.fn(), runJobsFor: vi.fn(), runJobsDirect: vi.fn() }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: vi.fn() }));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: vi.fn() }));
vi.mock("@/lib/data/landing-email-log", () => ({ listEmailLog: vi.fn() }));
vi.mock("@/lib/data/participant-sends", () => ({ listMessagesForRegistrations: vi.fn() }));

import { listRegistrations, loadRowExtras } from "@/lib/data/landing-registration-admin";

const reg = (over: Record<string, unknown>) => ({
  page_id: "pg1", row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: "n@x.com", whatsapp: "0300",
  voucher_url: "", email_status: "", option_label: "Live", mode: "live", region: "PK", expected_amount: 5000, amount_received: null,
  currency: "PKR", status: "pending", status_changed_at: null, agent_id: null, group_size: 1, is_test: false,
  created_at: "2026-10-01T00:00:00Z", ...over,
});
let store: Store;
beforeEach(() => {
  db.reset();
  store = {
    landing_registrations: [
      reg({ id: "a", agent_id: "ag1", voucher_url: "https://drive.google.com/file/d/V1/view", whatsapp: "0311", created_at: "2026-10-03T00:00:00Z", email_status: "received_sent" }),
      reg({ id: "b", agent_id: "ag1", status: "paid", created_at: "2026-10-02T00:00:00Z" }),
      reg({ id: "c", agent_id: "ag1", created_at: "2026-10-01T12:00:00Z" }),
    ],
    landing_pages: [{ id: "pg1", title: "PPC" }],
    profiles: [{ id: "ag1", full_name: "Agent One" }],
    landing_jobs: [
      { id: "j1", registration_id: "a", type: "sheet_details", status: "failed" },
      { id: "j2", registration_id: "b", type: "sheet_details", status: "done" },
      { id: "j3", registration_id: "c", type: "sheet_status", status: "pending" },
    ],
    landing_email_log: [
      { id: "e1", registration_id: "b", kind: "paid", state: "sent", sent_at: "2026-10-05T00:00:00Z" },
      { id: "e2", registration_id: "b", kind: "manual_paid", state: "sent", sent_at: "2026-10-06T00:00:00Z" },
      { id: "e3", registration_id: "b", kind: "manual_paid", state: "sent", sent_at: "2026-10-04T00:00:00Z" },
      { id: "e4", registration_id: "b", kind: "manual_received", state: "sent", sent_at: "2026-10-07T00:00:00Z" },
      { id: "e5", registration_id: "b", kind: "manual_reserved", state: "claimed", sent_at: "2026-10-09T00:00:00Z" },
      { id: "e6", registration_id: "b", kind: "portal_link", state: "sent", sent_at: "2026-10-09T00:00:00Z" },
    ],
  };
  db.state.handler = memoryHandler(store);
});

describe("listRegistrations row extras", () => {
  it("admin rows carry voucher, whatsapp, waiting flag and last email times", async () => {
    const { rows } = await listRegistrations({ kind: "all" }, {});
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.a.voucherUrl).toBe("https://drive.google.com/file/d/V1/view");
    expect(by.a.whatsapp).toBe("0311");
    expect(by.b.voucherUrl).toBeNull();
    expect(by.a.sheetUpdateWaiting).toBe(true);
    expect(by.b.sheetUpdateWaiting).toBe(false); // done
    expect(by.c.sheetUpdateWaiting).toBe(false); // other job type
    expect(by.b.lastEmailAt).toEqual({ paid: "2026-10-06T00:00:00Z", received: "2026-10-07T00:00:00Z" });
    expect(by.a.lastEmailAt).toEqual({ received: "2026-10-03T00:00:00Z" }); // automatic received falls back to createdAt
    expect(by.c.lastEmailAt).toEqual({});
  });

  it("agent scope never carries the voucher", async () => {
    const { rows } = await listRegistrations({ kind: "agent", agentId: "ag1" }, {});
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.voucherUrl === null)).toBe(true);
    expect(rows.find((r) => r.id === "a")?.whatsapp).toBe("0311");
    expect(rows.every((r) => Object.keys(r.lastEmailAt).length === 0)).toBe(true);
    expect(db.find("landing_email_log", "select").length).toBe(0);
    expect(db.find("landing_jobs", "select").length).toBe(1);
  });
});

describe("list survives a failing extras lookup", () => {
  it("still returns rows, with sheetUpdateWaiting false, when the jobs lookup errors", async () => {
    const inner = memoryHandler(store);
    db.state.handler = (op) => (op.table === "landing_jobs" ? { data: null, error: { code: "XX000" } } : inner(op));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rows } = await listRegistrations({ kind: "all" }, {});
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.sheetUpdateWaiting === false)).toBe(true);
    expect(rows.find((r) => r.id === "b")?.lastEmailAt).toEqual({ paid: "2026-10-06T00:00:00Z", received: "2026-10-07T00:00:00Z" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("loadRowExtras", () => {
  it("queries jobs and email log in chunks of at most 100 ids", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `r${i}`);
    db.reset();
    db.state.handler = memoryHandler({ landing_jobs: [], landing_email_log: [] });
    await loadRowExtras(ids.map((id) => ({ id, createdAt: "2026-10-01T00:00:00Z", emailStatus: "" })));
    for (const table of ["landing_jobs", "landing_email_log"]) {
      const lists = db.find(table, "select").map((o) => o.filters.find(([k, f]) => k === "in" && f === "registration_id")?.[2] as string[]);
      expect(lists.length).toBe(3);
      expect(Math.max(...lists.map((l) => l.length))).toBeLessThanOrEqual(100);
      expect(lists.flat().sort()).toEqual([...ids].sort());
    }
  });
});
