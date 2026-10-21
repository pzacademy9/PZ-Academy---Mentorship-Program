import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord, RegistrationBundle } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(),
  listPaymentAccounts: vi.fn(), appendRegistrationRows: vi.fn(), applyRegistrationStatus: vi.fn(), applyRegistrationDetails: vi.fn(),
  sendTransactionalEmail: vi.fn(), saveSnapshots: vi.fn(), saveStatusSnapshots: vi.fn(), saveContactSnapshots: vi.fn(),
}));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/data/landing-sheet-sync", () => ({ saveSnapshots: m.saveSnapshots, saveStatusSnapshots: m.saveStatusSnapshots, saveContactSnapshots: m.saveContactSnapshots }));
vi.mock("@/lib/gas/event-sheet-client", () => ({
  appendRegistrationRows: m.appendRegistrationRows, applyRegistrationStatus: m.applyRegistrationStatus, applyRegistrationDetails: m.applyRegistrationDetails,
}));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));

import { JOB_HANDLERS } from "@/lib/landing/registration/job-handlers";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "lead", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha New",
  email: "new@example.com", whatsapp: "+92 300 1234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live", optionKeys: ["full"], mode: "live", tierKey: "g3", groupSize: 1,
  promoCodeText: null, expectedAmount: 11500, amountReceived: 11500, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: null, status: "paid", emailStatus: null, agentId: null, studentId: null,
  utm: {}, variantKey: "", isTest: false, createdAt: "2026-10-13T10:00:00.000Z", statusChangedAt: null, statusSource: "app", ...over,
});
const page = (over: Partial<RegistrablePage> = {}): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, variantKey: "", ...over,
});
const single = (): RegistrationBundle => ({ lead: rec(), members: [] });

function snapshotIs(email: string | null) {
  db.state.handler = (op) => (op.table === "landing_sheet_snapshots" ? { data: email === null ? null : { email }, error: null } : { data: null, error: null });
}

beforeEach(() => {
  db.reset();
  for (const f of Object.values(m)) f.mockReset();
  m.getRegistrablePageById.mockResolvedValue(page());
  m.getRegistrationBundle.mockResolvedValue(single());
  m.applyRegistrationDetails.mockResolvedValue({ ok: true, missing: [] });
  snapshotIs("old@example.com");
});

describe("sheet_details handler", () => {
  it("finds the row by the snapshot (old) email, writes the new details, then moves only the contact snapshot", async () => {
    await JOB_HANDLERS.sheet_details("reg-1");
    expect(m.applyRegistrationDetails).toHaveBeenCalledWith("sheet-1", [
      { refId: "PZA-PPC-001", matchEmail: "old@example.com", name: "Ayesha New", email: "new@example.com", whatsapp: "+92 300 1234567" },
    ]);
    expect(m.saveContactSnapshots).toHaveBeenCalledWith([{ id: "reg-1", name: "Ayesha New", email: "new@example.com", whatsapp: "+92 300 1234567" }]);
    expect(m.saveSnapshots).not.toHaveBeenCalled();
    expect(m.saveStatusSnapshots).not.toHaveBeenCalled();
  });
  it("uses the lead ref for a group member and finds the member by id", async () => {
    m.getRegistrationBundle.mockResolvedValue({
      lead: rec({ id: "reg-1", email: "lead@example.com" }),
      members: [rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", refId: null, name: "Bilal", email: "bilal2@example.com" })],
    });
    snapshotIs("bilal@example.com");
    await JOB_HANDLERS.sheet_details("reg-2");
    expect(m.applyRegistrationDetails).toHaveBeenCalledWith("sheet-1", [
      { refId: "PZA-PPC-001", matchEmail: "bilal@example.com", name: "Bilal", email: "bilal2@example.com", whatsapp: "+92 300 1234567" },
    ]);
    expect(m.saveContactSnapshots).toHaveBeenCalledWith([expect.objectContaining({ id: "reg-2" })]);
  });
  it("a row the sheet did not have throws (so the outbox retries) and moves no snapshot", async () => {
    m.applyRegistrationDetails.mockResolvedValue({ ok: true, missing: ["PZA-PPC-001|old@example.com"] });
    await expect(JOB_HANDLERS.sheet_details("reg-1")).rejects.toThrow();
    expect(m.saveContactSnapshots).not.toHaveBeenCalled();
    expect(m.saveSnapshots).not.toHaveBeenCalled();
    expect(m.saveStatusSnapshots).not.toHaveBeenCalled();
  });
  it("throws and moves no snapshot when the sheet call fails", async () => {
    m.applyRegistrationDetails.mockResolvedValue({ ok: false, missing: [] });
    await expect(JOB_HANDLERS.sheet_details("reg-1")).rejects.toThrow();
    expect(m.saveContactSnapshots).not.toHaveBeenCalled();
  });
  it("falls back to the current email when there is no snapshot", async () => {
    snapshotIs(null);
    await JOB_HANDLERS.sheet_details("reg-1");
    expect(m.applyRegistrationDetails.mock.calls[0][1][0]).toMatchObject({ matchEmail: "new@example.com", email: "new@example.com" });
  });
  it("skips test registrations and pages without a sheet", async () => {
    m.getRegistrationBundle.mockResolvedValue({ lead: rec({ isTest: true }), members: [] });
    await JOB_HANDLERS.sheet_details("reg-1");
    m.getRegistrationBundle.mockResolvedValue(single());
    m.getRegistrablePageById.mockResolvedValue(page({ sheetId: null }));
    await JOB_HANDLERS.sheet_details("reg-1");
    expect(m.applyRegistrationDetails).not.toHaveBeenCalled();
    expect(m.saveContactSnapshots).not.toHaveBeenCalled();
  });
});
