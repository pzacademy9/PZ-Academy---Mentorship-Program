import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import { PPC_CONFIG, contentWith } from "./helpers/landing-fixtures";
import { desiredEnrollment } from "@/lib/landing/registration/access-rules";
import type { RegistrationRecord, RegistrationBundle } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getRegistrationBundle: vi.fn(), markEmailStatus: vi.fn(), getRegistrablePageById: vi.fn(), listPaymentAccounts: vi.fn(),
  sendTransactionalEmail: vi.fn(), resolveAccess: vi.fn(), syncEnrollmentForRegistration: vi.fn(), claimEmail: vi.fn(), releaseEmail: vi.fn(),
}));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationBundle: m.getRegistrationBundle, markEmailStatus: m.markEmailStatus }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: m.getRegistrablePageById }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ appendRegistrationRows: vi.fn(), applyRegistrationStatus: vi.fn() }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.sendTransactionalEmail }));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: m.resolveAccess, syncEnrollmentForRegistration: m.syncEnrollmentForRegistration }));
vi.mock("@/lib/data/landing-email-log", () => ({ claimEmail: m.claimEmail, releaseEmail: m.releaseEmail }));

import { JOB_HANDLERS } from "@/lib/landing/registration/job-handlers";

const rec = (over: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: "reg-1", pageId: "page-1", rowType: "individual", leadRegistrationId: null, refId: "PZA-PPC-001", name: "Ayesha Khan",
  email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore", region: "PK", discovery: "WhatsApp",
  consent: true, optionLabel: "Live - Full Course - Individual", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1,
  promoCodeText: null, expectedAmount: 4800, amountReceived: 4800, currency: "PKR", paymentMethod: "faysal",
  voucherUrl: "https://drive.google.com/file/d/v1/view", status: "paid", emailStatus: null, agentId: null, studentId: "stu-1",
  utm: {}, variantKey: "", isTest: false, createdAt: "2026-10-13T10:00:00.000Z", statusChangedAt: null, statusSource: "app", ...over,
});
const page = (): RegistrablePage => ({
  id: "page-1", slug: "ppc-b3", title: "PPC Batch 3", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: "course-1", variantKey: "",
});
const bundle = (lead: RegistrationRecord, members: RegistrationRecord[] = []): RegistrationBundle => ({ lead, members });
const member = (id: string, name: string, email: string, over: Partial<RegistrationRecord> = {}) =>
  rec({ id, rowType: "member", leadRegistrationId: "reg-1", refId: null, name, email, expectedAmount: null, amountReceived: null, studentId: `stu-${id}`, ...over });
const group = () => bundle(rec({ rowType: "lead", tierKey: "g3", groupSize: 3 }), [member("reg-2", "Bilal", "bilal@example.com"), member("reg-3", "Sana", "sana@example.com")]);

/** resolveAccess stub driven by the person's own row, like the real one. */
function stubAccess(b: RegistrationBundle, opts: { batchFinished?: boolean; courseId?: string | null; statusOf?: (r: RegistrationRecord) => RegistrationRecord["status"] } = {}) {
  m.resolveAccess.mockImplementation(async (id: string) => {
    const r = [b.lead, ...b.members].find((x) => x.id === id)!;
    return {
      registration: opts.statusOf ? { ...r, status: opts.statusOf(r) } : r, lead: b.lead, pageId: "page-1",
      courseId: opts.courseId === undefined ? "course-1" : opts.courseId, courseSlug: "ppc",
      desired: desiredEnrollment({ status: r.status, mode: b.lead.mode, hasCourse: (opts.courseId === undefined ? "course-1" : opts.courseId) !== null, isTest: r.isTest, moduleIds: [], finishedModuleIds: opts.batchFinished ? ["m1"] : [] }),
      hasAccount: r.studentId !== null,
    };
  });
}
const sent = () => m.sendTransactionalEmail.mock.calls.map((c) => c[0] as { to: string; subject: string; htmlContent: string });

beforeEach(() => {
  db.reset();
  for (const f of Object.values(m)) f.mockReset();
  const claimed = new Set<string>();
  m.claimEmail.mockImplementation(async (id: string, kind: string) => { const k = `${id}:${kind}`; if (claimed.has(k)) return false; claimed.add(k); return true; });
  m.releaseEmail.mockImplementation(async (id: string, kind: string) => { claimed.delete(`${id}:${kind}`); });
  m.getRegistrablePageById.mockResolvedValue(page());
  m.listPaymentAccounts.mockResolvedValue([]);
  m.sendTransactionalEmail.mockResolvedValue({});
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("email_status", () => {
  it("Paid recorded person with an account: one email with the portal link, claimed; second run sends nothing", async () => {
    const b = bundle(rec({ mode: "recorded" }));
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe("ayesha@example.com");
    expect(sent()[0].htmlContent).toContain("https://app.example/portal/ppc");
    expect(m.claimEmail).toHaveBeenCalledWith("reg-1", "paid", "ayesha@example.com");
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()).toHaveLength(1);
  });
  it("Paid live with the portal still closed: no link, opens-later note", async () => {
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()[0].htmlContent).not.toContain("/portal/");
    expect(sent()[0].htmlContent).toContain("open after your batch finishes");
  });
  it("Paid live after the batch finished: portal link, no opens-later note", async () => {
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b, { batchFinished: true });
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()[0].htmlContent).toContain("https://app.example/portal/ppc");
    expect(sent()[0].htmlContent).not.toContain("open after your batch finishes");
  });
  it("a guest (no account) gets the account note and no portal link", async () => {
    const b = bundle(rec({ mode: "recorded", studentId: null }));
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    const html = sent()[0].htmlContent;
    expect(html).not.toContain("/portal/");
    expect(html).toContain("create an account");
    expect(html).toContain("https://app.example/register");
    expect(html).toContain("ayesha@example.com");
  });
  it("a group of three sends three emails to three addresses; members are covered by the group", async () => {
    const b = group();
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent().map((s) => s.to)).toEqual(["ayesha@example.com", "bilal@example.com", "sana@example.com"]);
    expect(sent()[0].htmlContent).not.toContain("Covered by your group");
    expect(sent()[1].htmlContent).toContain("Covered by your group");
    expect(sent()[2].htmlContent).toContain("Covered by your group");
    expect(sent()[1].htmlContent).toContain("Bilal");
    expect(m.claimEmail.mock.calls.map((c) => c[0])).toEqual(["reg-1", "reg-2", "reg-3"]);
  });
  it("a failure on member 2 releases only that claim and a retry sends only to member 2", async () => {
    const b = group();
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    m.sendTransactionalEmail.mockImplementation(async (a: { to: string }) => {
      if (a.to === "bilal@example.com" && m.sendTransactionalEmail.mock.calls.length === 2) throw new Error("Brevo 502");
      return {};
    });
    await expect(JOB_HANDLERS.email_status("reg-1")).rejects.toThrow("Brevo 502");
    expect(m.releaseEmail).toHaveBeenCalledTimes(1);
    expect(m.releaseEmail).toHaveBeenCalledWith("reg-2", "paid");
    expect(sent().map((s) => s.to)).toEqual(["ayesha@example.com", "bilal@example.com", "sana@example.com"]);
    m.sendTransactionalEmail.mockClear();
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent().map((s) => s.to)).toEqual(["bilal@example.com"]);
  });
  it("pending and free send nothing and claim nothing", async () => {
    for (const status of ["pending", "free"] as const) {
      const b = bundle(rec({ status }));
      m.getRegistrationBundle.mockResolvedValue(b);
      stubAccess(b);
      await JOB_HANDLERS.email_status("reg-1");
    }
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(m.claimEmail).not.toHaveBeenCalled();
  });
  it("each person uses their own current status", async () => {
    const b = bundle(rec({ rowType: "lead", status: "paid" }), [member("reg-2", "Bilal", "bilal@example.com", { status: "pending" })]);
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent().map((s) => s.to)).toEqual(["ayesha@example.com"]);
  });
  it("test rows go only to the admin who ran the test, claimed like any other", async () => {
    db.state.users = { "admin-1": { email: "admin@pzacademy.example" } };
    const b = bundle(rec({ isTest: true, studentId: "admin-1" }));
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent().map((s) => s.to)).toEqual(["admin@pzacademy.example"]);
    expect(sent()[0].subject.startsWith("[TEST] ")).toBe(true);
    expect(m.claimEmail).toHaveBeenCalledWith("reg-1", "paid", "ayesha@example.com");
  });
  it("underpaid and reserved use their own kinds and emails", async () => {
    for (const [status, word] of [["underpaid", "balance is outstanding"], ["reserved", "seat is reserved"]] as const) {
      m.sendTransactionalEmail.mockClear();
      const b = bundle(rec({ status, amountReceived: 1000 }));
      m.getRegistrationBundle.mockResolvedValue(b);
      stubAccess(b);
      await JOB_HANDLERS.email_status("reg-1");
      expect(m.claimEmail).toHaveBeenCalledWith("reg-1", status, "ayesha@example.com");
      expect(sent()[0].subject).toContain(word);
    }
  });
});

describe("email_status rulings", () => {
  it("Live buyer on a page with a course gets both the WhatsApp block and the opens-later sentence", async () => {
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()[0].htmlContent).toContain("open after your batch finishes");
    expect(sent()[0].htmlContent).toContain("Zoom link and updates are shared there");
  });
  it("Live buyer on a page with no course keeps the WhatsApp block but no portal-link promise", async () => {
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b, { courseId: null });
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()[0].htmlContent).not.toContain("open after your batch finishes");
    expect(sent()[0].htmlContent).toContain("Zoom link and updates are shared there");
  });
  it("a Live test row's Paid email includes the opens-later block", async () => {
    db.state.users = { "admin-1": { email: "admin@pzacademy.example" } };
    const b = bundle(rec({ isTest: true, studentId: "admin-1" }));
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    await JOB_HANDLERS.email_status("reg-1");
    expect(sent()[0].htmlContent).toContain("open after your batch finishes");
    expect(sent()[0].htmlContent).toContain("Zoom link and updates are shared there");
  });
  it("group lead Underpaid or Reserved: lead only, no member claims", async () => {
    for (const status of ["underpaid", "reserved"] as const) {
      m.sendTransactionalEmail.mockClear();
      m.claimEmail.mockClear();
      const b = group();
      for (const r of [b.lead, ...b.members]) r.status = status;
      m.getRegistrationBundle.mockResolvedValue(b);
      stubAccess(b);
      await JOB_HANDLERS.email_status("reg-1");
      expect(sent().map((s) => s.to)).toEqual(["ayesha@example.com"]);
      expect(m.claimEmail).toHaveBeenCalledTimes(1);
    }
  });
  it("status changed between bundle read and resolveAccess: nothing sent, claim released", async () => {
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b, { statusOf: () => "pending" });
    await JOB_HANDLERS.email_status("reg-1");
    expect(m.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(m.releaseEmail).toHaveBeenCalledWith("reg-1", "paid");
  });
  it("a failing release is logged and the original error still surfaces", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const b = bundle(rec());
    m.getRegistrationBundle.mockResolvedValue(b);
    stubAccess(b);
    m.sendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    m.releaseEmail.mockRejectedValue(new Error("db"));
    await expect(JOB_HANDLERS.email_status("reg-1")).rejects.toThrow("Brevo 502");
    expect(warn).toHaveBeenCalledWith("[landing-jobs] email claim release failed");
    warn.mockRestore();
  });
});

describe("enrollment_sync", () => {
  it("syncs the lead and every member", async () => {
    m.getRegistrationBundle.mockResolvedValue(group());
    m.syncEnrollmentForRegistration.mockResolvedValue("granted");
    await JOB_HANDLERS.enrollment_sync("reg-1");
    expect(m.syncEnrollmentForRegistration.mock.calls.map((c) => c[0])).toEqual(["reg-1", "reg-2", "reg-3"]);
  });
  it("tries everyone, then throws the first error", async () => {
    m.getRegistrationBundle.mockResolvedValue(group());
    m.syncEnrollmentForRegistration.mockImplementation(async (id: string) => { if (id !== "reg-3") throw new Error(`boom ${id}`); return "granted"; });
    await expect(JOB_HANDLERS.enrollment_sync("reg-1")).rejects.toThrow("boom reg-1");
    expect(m.syncEnrollmentForRegistration).toHaveBeenCalledTimes(3);
  });
});
