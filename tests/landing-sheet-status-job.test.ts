import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord, RegistrationBundle } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(),
  listPaymentAccounts: vi.fn(), appendRegistrationRows: vi.fn(), applyRegistrationStatus: vi.fn(), sendTransactionalEmail: vi.fn(),
}));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ appendRegistrationRows: m.appendRegistrationRows, applyRegistrationStatus: m.applyRegistrationStatus }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));

import { JOB_HANDLERS } from "@/lib/landing/registration/job-handlers";
import { enqueueSheetStatus, JOB_TYPES } from "@/lib/data/landing-jobs";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "lead", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha Khan",
  email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live", optionKeys: ["full"], mode: "live", tierKey: "g3", groupSize: 3,
  promoCodeText: null, expectedAmount: 11500, amountReceived: 11500, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: null, status: "paid", emailStatus: null, agentId: null, studentId: null,
  utm: {}, variantKey: "", isTest: false, createdAt: "2026-10-13T10:00:00.000Z", statusChangedAt: null, statusSource: "app", ...over,
});
const page = (over: Partial<RegistrablePage> = {}): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, variantKey: "", ...over,
});
const group = (): RegistrationBundle => ({
  lead: rec(),
  members: [
    rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", refId: null, name: "Bilal", email: "bilal@example.com", amountReceived: null }),
    rec({ id: "reg-3", rowType: "member", leadRegistrationId: "reg-1", refId: null, name: "Sana", email: "sana@example.com", amountReceived: null }),
  ],
});

beforeEach(() => {
  db.reset();
  for (const f of Object.values(m)) f.mockReset();
  m.getRegistrablePageById.mockResolvedValue(page());
  m.applyRegistrationStatus.mockResolvedValue({ ok: true });
});

describe("enqueueSheetStatus", () => {
  it("enqueueSheetStatus resets an existing done job to pending", async () => {
    db.state.handler = () => ({ data: null, error: null });
    await expect(enqueueSheetStatus("reg-1")).resolves.toBe(true);
    const op = db.find("landing_jobs", "upsert")[0];
    expect(op.upsertOptions).toMatchObject({ onConflict: "registration_id,type" });
    expect(op.payload).toMatchObject({ registration_id: "reg-1", type: "sheet_status", status: "pending", attempts: 0, last_error: null });
    expect(typeof (op.payload as { next_run_at: string }).next_run_at).toBe("string");
  });
  it("never throws and returns false on a write error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(enqueueSheetStatus("reg-1")).resolves.toBe(false);
  });
  it("runs after sheet_append", () => {
    expect(JOB_TYPES.indexOf("sheet_status")).toBeGreaterThan(JOB_TYPES.indexOf("sheet_append"));
  });
});

describe("sheet_status handler", () => {
  it("handler sends lead and members with their own emails and the lead ref", async () => {
    m.getRegistrationBundle.mockResolvedValue(group());
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.applyRegistrationStatus).toHaveBeenCalledWith("sheet-1", [
      { refId: "PZA-PPC-001", email: "ayesha@example.com", status: "paid", amountReceived: 11500 },
      { refId: "PZA-PPC-001", email: "bilal@example.com", status: "paid", amountReceived: null },
      { refId: "PZA-PPC-001", email: "sana@example.com", status: "paid", amountReceived: null },
    ]);
  });
  it("handler skips test registrations and pages without a sheet", async () => {
    m.getRegistrationBundle.mockResolvedValue({ lead: rec({ isTest: true }), members: [] });
    await JOB_HANDLERS.sheet_status("reg-1");
    m.getRegistrationBundle.mockResolvedValue(group());
    m.getRegistrablePageById.mockResolvedValue(page({ sheetId: null }));
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.applyRegistrationStatus).not.toHaveBeenCalled();
  });
  it("handler throws when the sheet call fails", async () => {
    m.getRegistrationBundle.mockResolvedValue(group());
    m.applyRegistrationStatus.mockResolvedValue({ ok: false });
    await expect(JOB_HANDLERS.sheet_status("reg-1")).rejects.toThrow();
  });
});
