import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, W20_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord, RegistrationBundle } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(),
  listPaymentAccounts: vi.fn(), appendRegistrationRows: vi.fn(), sendTransactionalEmail: vi.fn(),
}));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ appendRegistrationRows: m.appendRegistrationRows }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));

import { JOB_HANDLERS, toSheetRegistration, notifyVoucherResubmitted, RECEIVED_SENT } from "@/lib/landing/registration/job-handlers";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "individual", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha Khan",
  email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live - Full Course - Individual", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1,
  promoCodeText: null, expectedAmount: 4800, amountReceived: null, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: "https://drive.google.com/file/d/v1/view", status: "pending", emailStatus: null, agentId: null, studentId: null,
  utm: { utm_campaign: "b3" }, isTest: false, createdAt: "2026-10-13T10:00:00.000Z", ...over,
});
const page = (over: Partial<RegistrablePage> = {}): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, ...over,
});
const bundle = (lead: RegistrationRecord, members: RegistrationRecord[] = []): RegistrationBundle => ({ lead, members });
const groupBundle = () => bundle(
  rec({ rowType: "lead", tierKey: "g3", groupSize: 3, expectedAmount: 11500 }),
  [rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", refId: null, name: "Bilal", email: "bilal@example.com", expectedAmount: null, voucherUrl: null, paymentMethod: null }),
   rec({ id: "reg-3", rowType: "member", leadRegistrationId: "reg-1", refId: null, name: "Sana", email: "sana@example.com", expectedAmount: null, voucherUrl: null, paymentMethod: null })],
);

beforeEach(() => {
  db.reset();
  for (const f of Object.values(m)) f.mockReset();
  m.getRegistrablePageById.mockResolvedValue(page());
  m.listPaymentAccounts.mockResolvedValue([{ key: "faysal", label: "Faysal Bank", kind: "bank", rows: [{ label: "Account No.", value: "3573499000006913" }], displayText: "" }]);
  m.appendRegistrationRows.mockResolvedValue({ ok: true });
  m.sendTransactionalEmail.mockResolvedValue({});
  m.markEmailStatus.mockResolvedValue(undefined);
  vi.stubEnv("LANDING_ADMIN_EMAIL", "team@pzacademy.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("toSheetRegistration", () => {
  it("members carry the lead's ref and email, every row the page source and region code", () => {
    const b = groupBundle();
    const s = toSheetRegistration(b.members[0], b.lead, page(), "Sara", "Faysal Bank");
    expect(s).toMatchObject({
      refId: "PZA-PPC-001", groupLeadEmail: "ayesha@example.com", rowType: "member", email: "bilal@example.com", regionKey: "PK",
      source: "landing:ppc-b3", agentName: "Sara", utmCampaign: "b3", expectedAmount: 11500, paymentMethodLabel: "", voucherUrl: "",
    });
    expect(toSheetRegistration(b.lead, b.lead, page(), "Sara", "Faysal Bank")).toMatchObject({ rowType: "lead", paymentMethodLabel: "Faysal Bank", groupLeadEmail: "ayesha@example.com" });
  });
});

describe("sheet_append", () => {
  it("appends lead and member rows of 23 cells", async () => {
    m.getRegistrationBundle.mockResolvedValue(groupBundle());
    await JOB_HANDLERS.sheet_append("reg-1");
    const [sheetId, rows] = m.appendRegistrationRows.mock.calls[0];
    expect(sheetId).toBe("sheet-1");
    expect(rows).toHaveLength(3);
    for (const r of rows as string[][]) expect(r).toHaveLength(23);
  });
  it("skips pages without a sheet and test registrations", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.getRegistrablePageById.mockResolvedValue(page({ sheetId: null }));
    await JOB_HANDLERS.sheet_append("reg-1");
    m.getRegistrablePageById.mockResolvedValue(page());
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ isTest: true })));
    await JOB_HANDLERS.sheet_append("reg-1");
    expect(m.appendRegistrationRows).not.toHaveBeenCalled();
  });
  it("throws when Apps Script fails so the outbox retries", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.appendRegistrationRows.mockResolvedValue({ ok: false, message: "Sheet is busy, try again" });
    await expect(JOB_HANDLERS.sheet_append("reg-1")).rejects.toThrow("Sheet is busy");
  });
});

describe("emails", () => {
  it("received goes to the registrant once", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    await JOB_HANDLERS.email_received("reg-1");
    expect(m.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ayesha@example.com", subject: "Got your registration, Ayesha - confirming within 24h" }));
    expect(m.markEmailStatus).toHaveBeenCalledWith("reg-1", RECEIVED_SENT);
    m.sendTransactionalEmail.mockClear();
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ emailStatus: RECEIVED_SENT })));
    await JOB_HANDLERS.email_received("reg-1");
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("free registrations get the joining-details email and no accounts lookup", async () => {
    m.getRegistrablePageById.mockResolvedValue(page({ registration: W20_CONFIG, content: contentWith(W20_CONFIG) }));
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ status: "free", optionKeys: ["free"], expectedAmount: 0, paymentMethod: null })));
    await JOB_HANDLERS.email_received("reg-1");
    expect(m.sendTransactionalEmail.mock.calls[0][0].subject).toBe("You're in, Ayesha - here are your joining details");
    expect(m.listPaymentAccounts).not.toHaveBeenCalled();
  });
  it("test registrations go only to the admin who ran the test, with [TEST]", async () => {
    db.state.users = { "admin-1": { email: "admin@pzacademy.example" } };
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ isTest: true, studentId: "admin-1", refId: "TEST-12345" })));
    await JOB_HANDLERS.email_received("reg-1");
    await JOB_HANDLERS.email_admin("reg-1");
    const calls = m.sendTransactionalEmail.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to)).toEqual(["admin@pzacademy.example", "admin@pzacademy.example"]);
    for (const c of calls) expect(c.subject.startsWith("[TEST] ")).toBe(true);
  });
  it("a test registration with no admin address sends nothing", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ isTest: true, studentId: null })));
    await JOB_HANDLERS.email_received("reg-1");
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("members: each unsent member once; a failure is retried without resending the others", async () => {
    const b = groupBundle();
    b.members[0].emailStatus = RECEIVED_SENT;
    m.getRegistrationBundle.mockResolvedValue(b);
    m.sendTransactionalEmail.mockRejectedValueOnce(new Error("Brevo 502"));
    await expect(JOB_HANDLERS.email_members("reg-1")).rejects.toThrow("Brevo 502");
    expect(m.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(m.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: "sana@example.com", subject: "You're in Ayesha's group - confirming within 24h" });
  });
  it("admin alert goes to LANDING_ADMIN_EMAIL and is skipped without it", async () => {
    m.getRegistrationBundle.mockResolvedValue(groupBundle());
    await JOB_HANDLERS.email_admin("reg-1");
    expect(m.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: "team@pzacademy.example", subject: "Group PPC Batch 3 Registration - Ayesha Khan x3 - PKR 11,500" });
    m.sendTransactionalEmail.mockClear();
    vi.stubEnv("LANDING_ADMIN_EMAIL", "");
    await JOB_HANDLERS.email_admin("reg-1");
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("voucher re-upload alert never throws", async () => {
    m.getRegistrationBundle.mockRejectedValue(new Error("db down"));
    await expect(notifyVoucherResubmitted("reg-1")).resolves.toBeUndefined();
  });
});
