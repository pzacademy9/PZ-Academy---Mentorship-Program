import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, W20_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord, RegistrationBundle } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(),
  listPaymentAccounts: vi.fn(), appendRegistrationRows: vi.fn(), applyRegistrationStatus: vi.fn(), sendTransactionalEmail: vi.fn(),
  saveSnapshots: vi.fn(), saveStatusSnapshots: vi.fn(),
  claimEmail: vi.fn(), markEmailSent: vi.fn(), releaseEmail: vi.fn(), resolveAccess: vi.fn(), syncEnrollmentForRegistration: vi.fn(),
  claimMetaPurchase: vi.fn(), markMetaPurchaseSent: vi.fn(), markMetaPurchaseSkipped: vi.fn(), releaseMetaPurchase: vi.fn(), firstPaidAt: vi.fn(),
  sendMetaEvent: vi.fn(),
}));
vi.mock("@/lib/data/landing-meta-events", () => ({
  claimMetaPurchase: m.claimMetaPurchase, markMetaPurchaseSent: m.markMetaPurchaseSent, markMetaPurchaseSkipped: m.markMetaPurchaseSkipped,
  releaseMetaPurchase: m.releaseMetaPurchase, firstPaidAt: m.firstPaidAt,
}));
vi.mock("@/lib/meta/capi-client", () => ({ sendMetaEvent: m.sendMetaEvent }));
vi.mock("@/lib/data/landing-email-log", () => ({ claimEmail: m.claimEmail, markEmailSent: m.markEmailSent, releaseEmail: m.releaseEmail }));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: m.resolveAccess, syncEnrollmentForRegistration: m.syncEnrollmentForRegistration }));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ appendRegistrationRows: m.appendRegistrationRows, applyRegistrationStatus: m.applyRegistrationStatus }));
vi.mock("@/lib/data/landing-sheet-sync", () => ({ saveSnapshots: m.saveSnapshots, saveStatusSnapshots: m.saveStatusSnapshots }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));

import { JOB_HANDLERS, toSheetRegistration, notifyVoucherResubmitted, RECEIVED_SENT } from "@/lib/landing/registration/job-handlers";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "individual", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha Khan",
  email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live - Full Course - Individual", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1,
  promoCodeText: null, expectedAmount: 4800, amountReceived: null, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: "https://drive.google.com/file/d/v1/view", status: "pending", emailStatus: null, agentId: null, studentId: null,
  utm: { utm_campaign: "b3" }, variantKey: "", isTest: false, createdAt: "2026-10-13T10:00:00.000Z", statusChangedAt: null, statusSource: "app", ...over,
});
const page = (over: Partial<RegistrablePage> = {}): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, variantKey: "", ...over,
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
  m.applyRegistrationStatus.mockResolvedValue({ ok: true });
  m.saveSnapshots.mockResolvedValue(undefined);
  m.saveStatusSnapshots.mockResolvedValue(undefined);
  m.sendTransactionalEmail.mockResolvedValue({});
  m.markEmailStatus.mockResolvedValue(undefined);
  m.claimEmail.mockResolvedValue(true);
  m.markEmailSent.mockResolvedValue(undefined);
  m.releaseEmail.mockResolvedValue(undefined);
  vi.stubEnv("LANDING_ADMIN_EMAIL", "team@pzacademy.example");
  m.claimMetaPurchase.mockResolvedValue(true);
  m.markMetaPurchaseSent.mockResolvedValue(undefined);
  m.markMetaPurchaseSkipped.mockResolvedValue(undefined);
  m.releaseMetaPurchase.mockResolvedValue(undefined);
  m.firstPaidAt.mockResolvedValue(new Date().toISOString());
  m.sendMetaEvent.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "env-pixel");
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

describe("toSheetRegistration variantKey", () => {
  it("takes the lead's variant key, blank for the main page", () => {
    const b = groupBundle();
    expect(toSheetRegistration(b.lead, b.lead, page(), "Sara", "Faysal Bank").variantKey).toBe("");
    const v = bundle(rec({ rowType: "lead", variantKey: "uae/module-2" }), [rec({ id: "reg-2", rowType: "member", variantKey: "" })]);
    expect(toSheetRegistration(v.members[0], v.lead, page(), "Sara", "Faysal Bank").variantKey).toBe("uae/module-2");
  });
});

describe("sheet_append", () => {
  it("appends lead and member rows of 24 cells", async () => {
    m.getRegistrationBundle.mockResolvedValue(groupBundle());
    await JOB_HANDLERS.sheet_append("reg-1");
    const [sheetId, rows] = m.appendRegistrationRows.mock.calls[0];
    expect(sheetId).toBe("sheet-1");
    expect(rows).toHaveLength(3);
    for (const r of rows as string[][]) expect(r).toHaveLength(24);
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
  it("remembers lead and members as last written (normalizing happens in saveSnapshots)", async () => {
    const b = groupBundle();
    b.lead.status = "paid";
    b.lead.amountReceived = 11500;
    m.getRegistrationBundle.mockResolvedValue(b);
    await JOB_HANDLERS.sheet_append("reg-1");
    const saved = m.saveSnapshots.mock.calls[0][0] as { id: string }[];
    expect(saved.map((r) => r.id)).toEqual(["reg-1", "reg-2", "reg-3"]);
    expect(saved[0]).toEqual({ id: "reg-1", status: "paid", amountReceived: 11500, name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "+923001234567" });
  });
  it("saves no snapshot when the append fails, or for tests and pages without a sheet", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.appendRegistrationRows.mockResolvedValue({ ok: false, message: "busy" });
    await expect(JOB_HANDLERS.sheet_append("reg-1")).rejects.toThrow();
    m.appendRegistrationRows.mockResolvedValue({ ok: true });
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ isTest: true })));
    await JOB_HANDLERS.sheet_append("reg-1");
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.getRegistrablePageById.mockResolvedValue(page({ sheetId: null }));
    await JOB_HANDLERS.sheet_append("reg-1");
    expect(m.saveSnapshots).not.toHaveBeenCalled();
  });
  it("throws when the snapshot save fails so the job retries", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.saveSnapshots.mockRejectedValue(new Error("db down"));
    await expect(JOB_HANDLERS.sheet_append("reg-1")).rejects.toThrow("db down");
  });
});

describe("sheet_status snapshots", () => {
  it("writes only status and amount after a good push", async () => {
    const b = groupBundle();
    b.lead.status = "paid";
    b.lead.amountReceived = 11500;
    m.getRegistrationBundle.mockResolvedValue(b);
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.saveSnapshots).not.toHaveBeenCalled();
    expect(m.saveStatusSnapshots).toHaveBeenCalledWith([
      { id: "reg-1", status: "paid", amountReceived: 11500 },
      { id: "reg-2", status: "pending", amountReceived: null },
      { id: "reg-3", status: "pending", amountReceived: null },
    ]);
  });
  it("writes nothing when the push fails, or for tests and pages without a sheet", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.applyRegistrationStatus.mockResolvedValue({ ok: false });
    await expect(JOB_HANDLERS.sheet_status("reg-1")).rejects.toThrow();
    m.applyRegistrationStatus.mockResolvedValue({ ok: true });
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ isTest: true })));
    await JOB_HANDLERS.sheet_status("reg-1");
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.getRegistrablePageById.mockResolvedValue(page({ sheetId: null }));
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.saveStatusSnapshots).not.toHaveBeenCalled();
  });
  it("matches the sheet row on the snapshot email after an unsynced email edit, and saves the status snapshot", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ email: "new@example.com", status: "paid", amountReceived: 4800 })));
    db.state.handler = () => ({ data: [{ registration_id: "reg-1", email: " Old@Example.com " }], error: null });
    await JOB_HANDLERS.sheet_status("reg-1");
    const rows = m.applyRegistrationStatus.mock.calls[0][1] as { email: string }[];
    expect(rows[0].email).toBe("Old@Example.com");
    expect(m.saveStatusSnapshots).toHaveBeenCalledWith([{ id: "reg-1", status: "paid", amountReceived: 4800 }]);
    // The script reports the row missing under the snapshot-email key: no status snapshot is saved.
    m.saveStatusSnapshots.mockClear();
    m.applyRegistrationStatus.mockResolvedValue({ ok: true, missing: ["PZA-PPC-001|old@example.com"] });
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.saveStatusSnapshots).toHaveBeenCalledWith([]);
  });
  it("matches on the current email when no snapshot exists", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec({ email: "new@example.com" })));
    db.state.handler = () => ({ data: [], error: null });
    await JOB_HANDLERS.sheet_status("reg-1");
    expect((m.applyRegistrationStatus.mock.calls[0][1] as { email: string }[])[0].email).toBe("new@example.com");
    m.applyRegistrationStatus.mockResolvedValue({ ok: true, missing: ["PZA-PPC-001|new@example.com"] });
    m.saveStatusSnapshots.mockClear();
    await JOB_HANDLERS.sheet_status("reg-1");
    expect(m.saveStatusSnapshots).toHaveBeenCalledWith([]);
  });
  it("throws when the snapshot update fails so the job retries", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(rec()));
    m.saveStatusSnapshots.mockRejectedValue(new Error("db down"));
    await expect(JOB_HANDLERS.sheet_status("reg-1")).rejects.toThrow("db down");
  });
});

describe("email_status", () => {
  const paidAccess = (r: RegistrationRecord) => ({
    registration: r, lead: r, pageId: "page-1", courseId: null, courseSlug: null, hasAccount: false,
    desired: { action: "skip", status: "pending", portalOpen: false, accessLevel: "live", moduleIds: [], openModuleIds: [] },
  });
  it("marks the claim sent after a good send", async () => {
    const r = rec({ status: "paid" });
    m.getRegistrationBundle.mockResolvedValue(bundle(r));
    m.resolveAccess.mockResolvedValue(paidAccess(r));
    await JOB_HANDLERS.email_status("reg-1");
    expect(m.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(m.markEmailSent).toHaveBeenCalledWith("reg-1", "paid");
    expect(m.releaseEmail).not.toHaveBeenCalled();
  });
  it("releases the claim and does not mark sent when the send fails", async () => {
    const r = rec({ status: "paid" });
    m.getRegistrationBundle.mockResolvedValue(bundle(r));
    m.resolveAccess.mockResolvedValue(paidAccess(r));
    m.sendTransactionalEmail.mockRejectedValueOnce(new Error("Brevo 502"));
    await expect(JOB_HANDLERS.email_status("reg-1")).rejects.toThrow("Brevo 502");
    expect(m.releaseEmail).toHaveBeenCalledWith("reg-1", "paid");
    expect(m.markEmailSent).not.toHaveBeenCalled();
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

describe("meta_purchase", () => {
  const paid = (over: Partial<RegistrationRecord> = {}) => rec({ status: "paid", amountReceived: 4800, ...over });
  beforeEach(() => { db.state.handler = () => ({ data: { fbp: "fb.1.1.2", fbc: "fb.1.1.3" }, error: null }); });

  it("does nothing when the registration or page is missing", async () => {
    m.getRegistrationBundle.mockResolvedValue(null);
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.claimMetaPurchase).not.toHaveBeenCalled();
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.getRegistrablePageById.mockResolvedValue(null);
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.claimMetaPurchase).not.toHaveBeenCalled();
  });
  it("does nothing for test rows, non-paid rows and member rows", async () => {
    for (const lead of [paid({ isTest: true }), rec({ status: "pending" }), rec({ status: "free" }), rec({ status: "underpaid" }), paid({ rowType: "member" })]) {
      m.getRegistrationBundle.mockResolvedValue(bundle(lead));
      await JOB_HANDLERS.meta_purchase("reg-1");
    }
    expect(m.claimMetaPurchase).not.toHaveBeenCalled();
    expect(m.sendMetaEvent).not.toHaveBeenCalled();
  });
  it("reads fbp and fbc straight from landing_registrations", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    await JOB_HANDLERS.meta_purchase("reg-1");
    const op = db.find("landing_registrations", "select")[0];
    expect(op.filters).toContainEqual(["eq", "id", "reg-1"]);
    const event = m.sendMetaEvent.mock.calls[0][1];
    expect(event.user_data.fbp).toBe("fb.1.1.2");
    expect(event.user_data.fbc).toBe("fb.1.1.3");
  });
  it("sends one Purchase with the stable event id, then marks sent", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.firstPaidAt.mockResolvedValue("2026-10-22T08:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T09:00:00.000Z"));
    try { await JOB_HANDLERS.meta_purchase("reg-1"); } finally { vi.useRealTimers(); }
    expect(m.claimMetaPurchase).toHaveBeenCalledWith("reg-1", "purchase-reg-1");
    expect(m.sendMetaEvent).toHaveBeenCalledTimes(1);
    const [pixel, event] = m.sendMetaEvent.mock.calls[0];
    expect(pixel).toBe("env-pixel");
    expect(event).toMatchObject({ event_name: "Purchase", event_id: "purchase-reg-1", event_time: Date.parse("2026-10-22T08:00:00.000Z") / 1000, custom_data: { value: 4800, currency: "PKR" } });
    expect(event.event_source_url.endsWith("/ppc-b3")).toBe(true);
    expect(m.markMetaPurchaseSent).toHaveBeenCalledWith("reg-1", { value: 4800, currency: "PKR" });
    expect(m.releaseMetaPurchase).not.toHaveBeenCalled();
  });
  it("falls back to statusChangedAt when no paid event is logged", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid({ statusChangedAt: "2026-10-22T07:00:00.000Z" })));
    m.firstPaidAt.mockResolvedValue(null);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T09:00:00.000Z"));
    try { await JOB_HANDLERS.meta_purchase("reg-1"); } finally { vi.useRealTimers(); }
    expect(m.sendMetaEvent.mock.calls[0][1].event_time).toBe(Date.parse("2026-10-22T07:00:00.000Z") / 1000);
  });
  it("sends nothing when the claim already exists (paid again, or a simultaneous job)", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.claimMetaPurchase.mockResolvedValue(false);
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.sendMetaEvent).not.toHaveBeenCalled();
    expect(m.markMetaPurchaseSent).not.toHaveBeenCalled();
    expect(m.releaseMetaPurchase).not.toHaveBeenCalled();
  });
  it("two simultaneous calls send once", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.claimMetaPurchase.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await Promise.all([JOB_HANDLERS.meta_purchase("reg-1"), JOB_HANDLERS.meta_purchase("reg-1")]);
    expect(m.sendMetaEvent).toHaveBeenCalledTimes(1);
  });
  it("records skipped_old and sends nothing when the first Paid is over 7 days old", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.firstPaidAt.mockResolvedValue(new Date(Date.now() - 8 * 86_400_000).toISOString());
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.claimMetaPurchase).toHaveBeenCalledWith("reg-1", "purchase-reg-1");
    expect(m.markMetaPurchaseSkipped).toHaveBeenCalledWith("reg-1", "older than 7 days");
    expect(m.sendMetaEvent).not.toHaveBeenCalled();
  });
  it("too old but already claimed: records nothing", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.firstPaidAt.mockResolvedValue(new Date(Date.now() - 8 * 86_400_000).toISOString());
    m.claimMetaPurchase.mockResolvedValue(false);
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.markMetaPurchaseSkipped).not.toHaveBeenCalled();
  });
  it("the page pixel id wins over the env one", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.getRegistrablePageById.mockResolvedValue(page({ registration: { ...PPC_CONFIG, pixelId: "page-pixel" } }));
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.sendMetaEvent.mock.calls[0][0]).toBe("page-pixel");
  });
  it("releases the claim and throws when no pixel id is set", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    await expect(JOB_HANDLERS.meta_purchase("reg-1")).rejects.toThrow("Meta Pixel ID not set");
    expect(m.releaseMetaPurchase).toHaveBeenCalledWith("reg-1");
    expect(m.sendMetaEvent).not.toHaveBeenCalled();
  });
  it("amount received wins, else expected; zero releases and throws", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid({ amountReceived: null, expectedAmount: 5000 })));
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.sendMetaEvent.mock.calls[0][1].custom_data.value).toBe(5000);
    m.sendMetaEvent.mockClear();
    m.getRegistrationBundle.mockResolvedValue(bundle(paid({ amountReceived: null, expectedAmount: null })));
    await expect(JOB_HANDLERS.meta_purchase("reg-1")).rejects.toThrow("Meta Purchase has no amount");
    expect(m.releaseMetaPurchase).toHaveBeenCalledWith("reg-1");
    expect(m.sendMetaEvent).not.toHaveBeenCalled();
  });
  it("a group uses only the lead row amount, never member rows", async () => {
    const b = groupBundle();
    b.lead.status = "paid";
    b.lead.amountReceived = 11500;
    b.members[0].amountReceived = 999;
    m.getRegistrationBundle.mockResolvedValue(b);
    await JOB_HANDLERS.meta_purchase("reg-1");
    expect(m.sendMetaEvent).toHaveBeenCalledTimes(1);
    expect(m.sendMetaEvent.mock.calls[0][1].custom_data.value).toBe(11500);
  });
  it("releases the claim and rethrows when Meta fails, even if the release itself fails", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.sendMetaEvent.mockRejectedValue(new Error("Meta rejected the event (HTTP 500)"));
    m.releaseMetaPurchase.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(JOB_HANDLERS.meta_purchase("reg-1")).rejects.toThrow("Meta rejected the event");
    expect(m.releaseMetaPurchase).toHaveBeenCalledWith("reg-1");
    expect(m.markMetaPurchaseSent).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("a failed sent-mark does not throw (the claimed row still blocks a second send)", async () => {
    m.getRegistrationBundle.mockResolvedValue(bundle(paid()));
    m.markMetaPurchaseSent.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(JOB_HANDLERS.meta_purchase("reg-1")).resolves.toBeUndefined();
    expect(m.releaseMetaPurchase).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
