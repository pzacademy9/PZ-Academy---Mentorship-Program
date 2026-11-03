// tests/landing-status-review-fixes.test.tsx
// Review fixes for the list-row status pop-up: phone cards, silent changes, PKR amounts from the sheet.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createSupabaseMock, filterValue, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/landing/registration/job-handlers", () => ({ JOB_HANDLERS: {} }));
vi.mock("@/lib/data/landing-email-log", () => ({ sweepStaleClaims: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { cancelEmailStatus } from "@/lib/data/landing-jobs";
import { planScan, type AppReg, type SheetScanRow } from "@/lib/landing/registration/sheet-sync-engine";
import { checkStatusChange } from "@/lib/landing/registration/status-rules";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";
import { RowStatusCell } from "@/components/admin/registrations/RowStatusCell";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

beforeEach(() => db.reset());

describe("a silent status change cancels a waiting status email", () => {
  it("marks waiting or failed email_status jobs of that registration done", async () => {
    db.state.handler = memoryHandler({});
    await expect(cancelEmailStatus("reg-1")).resolves.toBeUndefined();
    const up = db.find("landing_jobs", "update")[0];
    expect(up.payload).toMatchObject({ status: "done" });
    expect(filterValue(up, "eq", "registration_id")).toBe("reg-1");
    expect(filterValue(up, "eq", "type")).toBe("email_status");
    expect(filterValue(up, "in", "status")).toEqual(["pending", "failed"]);
  });
  it("never throws", async () => {
    db.state.handler = () => { throw new Error("socket closed"); };
    await expect(cancelEmailStatus("reg-1")).resolves.toBeUndefined();
  });
});

describe("sheet sync keeps received amounts in PKR", () => {
  const reg = (o: Partial<AppReg> = {}): AppReg => ({
    id: "r1", refId: "PPC-1", leadRefId: "PPC-1", rowType: "individual", name: "Ann Lee", email: "ann@x.com",
    whatsapp: "923001234567", status: "pending", amountReceived: null, expectedAmount: 39, currency: "AED", isTest: false, ...o,
  });
  const row = (o: Partial<SheetScanRow> = {}): SheetScanRow => ({
    rowNumber: 2, refId: "PPC-1", email: "ann@x.com", name: "Ann Lee", whatsapp: "923001234567", status: "Pending", amount: "", rowType: "Individual", ...o,
  });
  const snap = { registrationId: "r1", status: "pending" as const, amountReceived: null, name: "Ann Lee", email: "ann@x.com", whatsapp: "923001234567" };

  it("Underpaid with 2000 PKR on an AED 39 price is accepted", () => {
    const p = planScan([row({ status: "Underpaid", amount: "2000" })], [reg()], [snap], "live");
    expect(p.rejected).toEqual([]);
    expect(p.changes.map((c) => c.field)).toContain("status");
  });
  it("Paid with a blank amount on a non-PKR price leaves the amount empty", () => {
    expect(checkStatusChange({ rowType: "individual", from: "pending", to: "paid", expectedAmount: 39, amount: null, currency: "AED" }))
      .toEqual({ ok: true, amountReceived: null });
    expect(checkStatusChange({ rowType: "individual", from: "pending", to: "paid", expectedAmount: 2736, amount: null, currency: "PKR" }))
      .toEqual({ ok: true, amountReceived: 2736 });
  });
});

describe("phone cards", () => {
  const listRow: RegistrationListRow = {
    id: "r1", refId: "PZA-1", name: "Zainab Qasim", email: "z@x.com", pageId: "pg1", pageTitle: "PPC", optionLabel: "Full", mode: "live",
    region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR", status: "pending", agentId: null, agentName: null, groupSize: 1,
    isTest: false, createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null, voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false,
    lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, groupId: null,
  };
  it("the clickable status button is never inside a link", () => {
    render(
      <RegistrationsTable rows={[listRow]} total={1} basePath="/b" detailHrefBase="/d" showAgentColumn={false}
        statusCell={(r) => <RowStatusCell row={r} />} />,
    );
    const buttons = screen.getAllByRole("button", { name: /change status for zainab qasim/i });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b.closest("a")).toBeNull();
  });
});
