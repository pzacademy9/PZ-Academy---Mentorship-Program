import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(),
  listPaymentAccounts: vi.fn(), appendRegistrationRows: vi.fn(), applyRegistrationStatus: vi.fn(), sendTransactionalEmail: vi.fn(),
  saveSnapshots: vi.fn(), saveStatusSnapshots: vi.fn(),
  claimEmail: vi.fn(), markEmailSent: vi.fn(), releaseEmail: vi.fn(), lastSentAt: vi.fn(), logManualEmail: vi.fn(),
  resolveAccess: vi.fn(), syncEnrollmentForRegistration: vi.fn(),
  changeRegistrationStatus: vi.fn(),
}));
vi.mock("@/lib/data/landing-email-log", () => ({
  claimEmail: m.claimEmail, markEmailSent: m.markEmailSent, releaseEmail: m.releaseEmail, lastSentAt: m.lastSentAt, logManualEmail: m.logManualEmail,
}));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: m.resolveAccess, syncEnrollmentForRegistration: m.syncEnrollmentForRegistration }));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-registration-admin", () => ({ changeRegistrationStatus: m.changeRegistrationStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ appendRegistrationRows: m.appendRegistrationRows, applyRegistrationStatus: m.applyRegistrationStatus }));
vi.mock("@/lib/data/landing-sheet-sync", () => ({ saveSnapshots: m.saveSnapshots, saveStatusSnapshots: m.saveStatusSnapshots }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));

const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: 403 }) }),
}));

import { sendStatusEmailAgain } from "@/lib/landing/registration/job-handlers";
import { manualKindsFor } from "@/lib/landing/registration/manual-kinds";
import { POST } from "@/app/api/admin/registrations/[id]/status-email/route";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "individual", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha Khan",
  email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live - Full Course - Individual", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1,
  promoCodeText: null, expectedAmount: 4800, amountReceived: 4800, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: null, status: "paid", emailStatus: null, agentId: null, studentId: null,
  utm: {}, variantKey: "", isTest: false, createdAt: "2026-10-13T10:00:00.000Z", statusChangedAt: null, statusSource: "app", ...over,
});
const page = (): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, variantKey: "",
});
const access = (registration: RegistrationRecord, lead: RegistrationRecord = registration) => ({
  registration, lead, pageId: "page-1", courseId: null, courseSlug: null, hasAccount: false,
  desired: { action: "skip", status: "active", portalOpen: false, moduleIds: [] },
});

beforeEach(() => {
  db.reset();
  for (const f of Object.values(m)) f.mockReset();
  gate.ok = true;
  m.getRegistrablePageById.mockResolvedValue(page());
  m.listPaymentAccounts.mockResolvedValue([]);
  m.sendTransactionalEmail.mockResolvedValue({});
  m.lastSentAt.mockResolvedValue(null);
  m.logManualEmail.mockResolvedValue(undefined);
  m.resolveAccess.mockResolvedValue(access(rec()));
});

const noAutomaticSideEffects = () => {
  expect(m.claimEmail).not.toHaveBeenCalled();
  expect(m.markEmailSent).not.toHaveBeenCalled();
  expect(m.releaseEmail).not.toHaveBeenCalled();
  expect(m.markEmailStatus).not.toHaveBeenCalled();
  expect(m.syncEnrollmentForRegistration).not.toHaveBeenCalled();
  expect(m.changeRegistrationStatus).not.toHaveBeenCalled();
  // No database write of any kind from the handler itself (no jobs enqueued, no status RPC, no email_status update).
  expect(db.state.ops.filter((o) => o.op !== "select")).toHaveLength(0);
};

describe("manualKindsFor", () => {
  it("members get received and paid; everyone else all four", () => {
    expect(manualKindsFor("member")).toEqual(["received", "paid"]);
    for (const t of ["lead", "individual"] as const) expect(manualKindsFor(t)).toEqual(["received", "paid", "underpaid", "reserved"]);
  });
});

describe("sendStatusEmailAgain", () => {
  it("first-ever send needs no confirm, sends once and logs a manual row", async () => {
    const r = await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: false });
    expect(r).toEqual({ ok: true });
    expect(m.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(m.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: "ayesha@example.com" });
    expect(m.logManualEmail).toHaveBeenCalledWith("reg-1", "manual_paid", "ayesha@example.com");
    noAutomaticSideEffects();
  });
  it("someone who already got Paid needs a confirm: nothing sent, sentAt returned", async () => {
    m.lastSentAt.mockResolvedValue("2026-10-15T09:00:00.000Z");
    const r = await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: false });
    expect(r).toEqual({ ok: false, reason: "needs-confirm", sentAt: "2026-10-15T09:00:00.000Z" });
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(m.logManualEmail).not.toHaveBeenCalled();
  });
  it("with confirmedAgain it sends once and logs manual_paid", async () => {
    m.lastSentAt.mockResolvedValue("2026-10-15T09:00:00.000Z");
    const r = await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: true });
    expect(r).toEqual({ ok: true });
    expect(m.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(m.logManualEmail).toHaveBeenCalledTimes(1);
    expect(m.logManualEmail).toHaveBeenCalledWith("reg-1", "manual_paid", "ayesha@example.com");
    noAutomaticSideEffects();
  });
  it("Received already sent by the automatic path (email_status) also needs a confirm", async () => {
    m.resolveAccess.mockResolvedValue(access(rec({ emailStatus: "received_sent", status: "pending" })));
    const r = await sendStatusEmailAgain({ registrationId: "reg-1", kind: "received", confirmedAgain: false });
    expect(r).toMatchObject({ ok: false, reason: "needs-confirm" });
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("a member asking for reserved is not allowed", async () => {
    const lead = rec({ rowType: "lead" });
    const member = rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", name: "Bilal", email: "bilal@example.com" });
    m.resolveAccess.mockResolvedValue(access(member, lead));
    const r = await sendStatusEmailAgain({ registrationId: "reg-2", kind: "reserved", confirmedAgain: true });
    expect(r).toEqual({ ok: false, reason: "not-allowed" });
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("a member can be sent Paid: goes to the member and is logged against the member", async () => {
    const lead = rec({ rowType: "lead" });
    const member = rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", name: "Bilal", email: "bilal@example.com" });
    m.resolveAccess.mockResolvedValue(access(member, lead));
    expect(await sendStatusEmailAgain({ registrationId: "reg-2", kind: "paid", confirmedAgain: false })).toEqual({ ok: true });
    expect(m.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: "bilal@example.com" });
    expect(m.logManualEmail).toHaveBeenCalledWith("reg-2", "manual_paid", "bilal@example.com");
  });
  it("member Received sends the member received email, and needs a confirm once a manual_received row exists", async () => {
    const lead = rec({ rowType: "lead" });
    const member = rec({ id: "reg-2", rowType: "member", leadRegistrationId: "reg-1", name: "Bilal", email: "bilal@example.com", status: "pending" });
    m.resolveAccess.mockResolvedValue(access(member, lead));
    expect(await sendStatusEmailAgain({ registrationId: "reg-2", kind: "received", confirmedAgain: false })).toEqual({ ok: true });
    expect(m.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: "bilal@example.com", subject: "You're in Ayesha's group - confirming within 24h" });
    expect(m.logManualEmail).toHaveBeenCalledWith("reg-2", "manual_received", "bilal@example.com");
    m.sendTransactionalEmail.mockClear();
    m.lastSentAt.mockResolvedValue("2026-10-21T11:30:00.000Z");
    expect(await sendStatusEmailAgain({ registrationId: "reg-2", kind: "received", confirmedAgain: false })).toEqual({ ok: false, reason: "needs-confirm", sentAt: "2026-10-21T11:30:00.000Z" });
    expect(m.lastSentAt).toHaveBeenLastCalledWith("reg-2", ["manual_received"]);
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
  });
  it("a free lead's Received sends the free joining-details email", async () => {
    m.resolveAccess.mockResolvedValue(access(rec({ status: "free", expectedAmount: 0, amountReceived: null })));
    expect(await sendStatusEmailAgain({ registrationId: "reg-1", kind: "received", confirmedAgain: false })).toEqual({ ok: true });
    expect(m.sendTransactionalEmail.mock.calls[0][0].subject).toBe("You're in, Ayesha - here are your joining details");
  });
  it("unknown registration is not-found", async () => {
    m.resolveAccess.mockResolvedValue(null);
    expect(await sendStatusEmailAgain({ registrationId: "nope", kind: "paid", confirmedAgain: false })).toEqual({ ok: false, reason: "not-found" });
  });
  it("a Brevo failure is send-failed and logs nothing", async () => {
    m.sendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    expect(await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: false })).toEqual({ ok: false, reason: "send-failed" });
    expect(m.logManualEmail).not.toHaveBeenCalled();
  });
  it("a test registration goes only to the test admin with the [TEST] prefix", async () => {
    db.state.users = { "admin-1": { email: "admin@pzacademy.example" } };
    m.resolveAccess.mockResolvedValue(access(rec({ isTest: true, studentId: "admin-1" })));
    expect(await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: false })).toEqual({ ok: true });
    expect(m.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = m.sendTransactionalEmail.mock.calls[0][0];
    expect(call.to).toBe("admin@pzacademy.example");
    expect(call.subject.startsWith("[TEST] ")).toBe(true);
  });
  it("a test registration with no admin address sends and logs nothing", async () => {
    m.resolveAccess.mockResolvedValue(access(rec({ isTest: true, studentId: null })));
    expect(await sendStatusEmailAgain({ registrationId: "reg-1", kind: "paid", confirmedAgain: false })).toEqual({ ok: false, reason: "send-failed" });
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(m.logManualEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/registrations/[id]/status-email", () => {
  const ID = "00000000-0000-4000-8000-000000000001";
  const call = (body: unknown, id = ID) =>
    POST(new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never, { params: Promise.resolve({ id }) });

  it("403 for a non-admin, before anything else", async () => {
    gate.ok = false;
    expect((await call({ kind: "paid" }, "not-a-uuid")).status).toBe(403);
  });
  it("404 for a malformed id (after auth)", async () => {
    expect((await call({ kind: "paid" }, "not-a-uuid")).status).toBe(404);
    expect(m.resolveAccess).not.toHaveBeenCalled();
  });
  it("400 for a bad body", async () => {
    expect((await call({ kind: "bogus" })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
  });
  it("409 with code and sentAt when already sent", async () => {
    m.lastSentAt.mockResolvedValue("2026-10-15T09:00:00.000Z");
    const res = await call({ kind: "paid" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This person already got this email.", code: "needs-confirm", sentAt: "2026-10-15T09:00:00.000Z" });
  });
  it("200 on success, with confirmedAgain passed through", async () => {
    m.lastSentAt.mockResolvedValue("2026-10-15T09:00:00.000Z");
    const res = await call({ kind: "paid", confirmedAgain: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("422 not allowed, 404 not found, 502 send failed", async () => {
    m.resolveAccess.mockResolvedValue(access(rec({ rowType: "member", leadRegistrationId: "x" }), rec({ rowType: "lead" })));
    expect((await call({ kind: "reserved" })).status).toBe(422);
    m.resolveAccess.mockResolvedValue(null);
    expect((await call({ kind: "paid" })).status).toBe(404);
    m.resolveAccess.mockResolvedValue(access(rec()));
    m.sendTransactionalEmail.mockRejectedValue(new Error("x"));
    const res = await call({ kind: "paid" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The email could not be sent. Try again.");
  });
});
