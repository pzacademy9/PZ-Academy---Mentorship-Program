// @vitest-environment node
// tests/landing-register-route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PPC_CONFIG, W20_CONFIG, PRE_EB, contentWith, ppcPayload, groupMembers } from "./helpers/landing-fixtures";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { PromoCode } from "@/lib/landing/registration/promo";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { checkVoucher, MAX_VOUCHER_UPLOAD_BYTES } from "@/lib/landing/registration/voucher";

const m = vi.hoisted(() => ({
  getRegistrablePage: vi.fn(),
  requireAdmin: vi.fn(),
  getUser: vi.fn(),
  getPromoByCode: vi.fn(),
  emailUsedPromo: vi.fn(),
  resolveAgentCode: vi.fn(),
  createRegistration: vi.fn(),
  findRecentRegistration: vi.fn(),
  findOpenRegistration: vi.fn(),
  countRecentRegistrations: vi.fn(),
  enqueueJobs: vi.fn(),
  runJobsFor: vi.fn(),
  runJobsDirect: vi.fn(),
  runInBackground: vi.fn(),
  uploadLandingVoucher: vi.fn(),
  resolveAccountKeysSafe: vi.fn(),
}));
vi.mock("@/lib/data/landing-payment-countries", () => ({ resolveAccountKeysSafe: m.resolveAccountKeysSafe }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePage: m.getRegistrablePage }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ auth: { getUser: m.getUser } }) }));
vi.mock("@/lib/data/landing-promo-codes", () => ({ normalizePromoCode: (c: string) => c.trim().toUpperCase(), getPromoByCode: m.getPromoByCode, emailUsedPromo: m.emailUsedPromo }));
vi.mock("@/lib/data/landing-agent-links", () => ({ resolveAgentCode: m.resolveAgentCode }));
vi.mock("@/lib/data/landing-registrations", () => ({
  createRegistration: m.createRegistration,
  findRecentRegistration: m.findRecentRegistration,
  findOpenRegistration: m.findOpenRegistration,
  countRecentRegistrations: m.countRecentRegistrations,
}));
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueJobs: m.enqueueJobs, runJobsFor: m.runJobsFor, runJobsDirect: m.runJobsDirect }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: m.runInBackground }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ uploadLandingVoucher: m.uploadLandingVoucher }));

import { POST as register } from "@/app/api/landing/[slug]/register/route";

const ctx = () => ({ params: Promise.resolve({ slug: "ppc-b4" }) });
const page = (registration: RegistrationConfig = PPC_CONFIG, over: Record<string, unknown> = {}) => ({
  id: "page-1", slug: "ppc-b4", title: "PPC Batch 4", status: "published", content: contentWith(registration), registration,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, ...over,
});
const png = (bytes = 1024, type = "image/png") => new File([new Uint8Array(bytes)], "shot.png", { type });
const submit = (payload: unknown, voucher: File | null = png()) => {
  const fd = new FormData();
  fd.append("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  if (voucher) fd.append("voucher", voucher);
  return register(new Request("http://x/api/landing/ppc-b4/register", { method: "POST", body: fd }) as never, ctx());
};
const inputOf = () => m.createRegistration.mock.calls[0][0];
const promo = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "promo-1", code: "PZ10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const recent = (over: Record<string, unknown> = {}) => ({
  refId: "PZA-PPC-007", status: "pending", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1,
  optionLabel: "Live - Full Course - Individual", expectedAmount: 4800, currency: "PKR", eventId: "evt-0001", ...over,
});
const nothingStored = () => {
  expect(m.uploadLandingVoucher).not.toHaveBeenCalled();
  expect(m.createRegistration).not.toHaveBeenCalled();
  expect(m.enqueueJobs).not.toHaveBeenCalled();
};

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PRE_EB);
  m.getRegistrablePage.mockResolvedValue(page());
  m.getUser.mockResolvedValue({ data: { user: null } });
  m.resolveAccountKeysSafe.mockImplementation(async (regions: { key: string; accountKeys: string[] }[]) =>
    Object.fromEntries(regions.map((r) => [r.key, r.accountKeys])));
  m.requireAdmin.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  m.getPromoByCode.mockResolvedValue(null);
  m.emailUsedPromo.mockResolvedValue(false);
  m.resolveAgentCode.mockResolvedValue(null);
  m.createRegistration.mockImplementation(async (input: { promo: { total: number } | null; quote: { total: number; currency: string } }) => ({
    ok: true, refId: "PZA-PPC-001", registrationIds: ["reg-1"], total: input.promo ? input.promo.total : input.quote.total, currency: input.quote.currency,
  }));
  m.findRecentRegistration.mockResolvedValue(null);
  m.findOpenRegistration.mockResolvedValue(null);
  m.countRecentRegistrations.mockResolvedValue(0);
  m.enqueueJobs.mockResolvedValue(undefined);
  m.runJobsFor.mockResolvedValue(undefined);
  m.uploadLandingVoucher.mockResolvedValue({ ok: true, url: "https://drive.google.com/file/d/v1/view" });
});
afterEach(() => vi.useRealTimers());

describe("checkVoucher", () => {
  it("accepts images and PDFs up to the cap", () => {
    expect(checkVoucher({ size: 10, type: "application/pdf" })).toEqual({ ok: true, ext: "pdf" });
    expect(checkVoucher({ size: MAX_VOUCHER_UPLOAD_BYTES, type: "image/webp" })).toEqual({ ok: true, ext: "webp" });
  });
  it("rejects empty, oversized and other files", () => {
    expect(checkVoucher({ size: 0, type: "image/png" })).toMatchObject({ ok: false, status: 400 });
    expect(checkVoucher({ size: MAX_VOUCHER_UPLOAD_BYTES + 1, type: "image/png" })).toMatchObject({ ok: false, status: 413 });
    expect(checkVoucher({ size: 10, type: "image/heic" })).toMatchObject({ ok: false, status: 415 });
  });
});

describe("POST /api/landing/[slug]/register: the happy path", () => {
  it("prices on the server, uploads the voucher, stores, queues the jobs, then answers 201", async () => {
    const res = await submit(ppcPayload());
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      refId: "PZA-PPC-001", total: 4800, currency: "PKR",
      waGroups: selectWaGroups(PPC_CONFIG, ["full"], "live"),
      verifyMessage: expect.stringContaining("Ref: PZA-PPC-001"),
    });
    const input = inputOf();
    expect(input).toMatchObject({
      page: { id: "page-1", refPrefix: "PPC" }, isTest: false, studentId: null, agentId: null, promo: null,
      voucherUrl: "https://drive.google.com/file/d/v1/view",
    });
    expect(input.quote).toMatchObject({ ok: true, total: 4800, earlyBirdApplied: true });
    const [slug, file, folder] = m.uploadLandingVoucher.mock.calls[0];
    expect(slug).toBe("ppc-b4");
    expect(folder).toBe("folder-1");
    expect(file.mimeType).toBe("image/png");
    expect(file.filename).toMatch(/^voucher_\d+\.png$/);
    expect(file.base64).toBe(Buffer.from(new Uint8Array(1024)).toString("base64"));
    expect(m.enqueueJobs).toHaveBeenCalledWith("reg-1", ["email_received", "sheet_append", "email_admin"]);
    expect(m.runJobsFor).toHaveBeenCalledWith("reg-1");
    expect(m.runInBackground).toHaveBeenCalledTimes(1);
    expect(m.enqueueJobs.mock.invocationCallOrder[0]).toBeLessThan(m.runInBackground.mock.invocationCallOrder[0]);
  });
  it("never reads a client total", async () => {
    const res = await submit({ ...ppcPayload(), total: 1, expectedAmount: 1, perPerson: 1 });
    expect((await res.json()).total).toBe(4800);
    expect(inputOf().quote.total).toBe(4800);
  });
  it("judges Early Bird by the absolute instant on the server", async () => {
    vi.setSystemTime(new Date("2026-10-15T18:59:59Z"));
    expect((await (await submit(ppcPayload())).json()).total).toBe(4800);
    vi.setSystemTime(new Date("2026-10-15T19:00:00Z"));
    expect((await (await submit(ppcPayload())).json()).total).toBe(6000);
  });
  it("a group pays the engine's group total and its members get their own emails", async () => {
    m.createRegistration.mockResolvedValue({ ok: true, refId: "PZA-PPC-001", registrationIds: ["reg-1", "m-1", "m-2"], total: 11500, currency: "PKR" });
    const res = await submit(ppcPayload({ tierKey: "g3", groupSize: 3, members: groupMembers(2) }));
    const expected = computeQuote({ config: PPC_CONFIG, regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "g3", groupSize: 3, now: PRE_EB });
    expect(expected.ok).toBe(true);
    expect((await res.json()).total).toBe(expected.ok ? expected.total : -1);
    expect(m.enqueueJobs).toHaveBeenCalledWith("reg-1", ["email_received", "sheet_append", "email_members", "email_admin"]);
  });
  it("a free registration needs no voucher and no payment account", async () => {
    m.getRegistrablePage.mockResolvedValue(page(W20_CONFIG));
    const res = await submit(ppcPayload({ optionKeys: ["free"], paymentMethod: "" }), null);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ total: 0, verifyMessage: "" });
    expect(body.waGroups).toEqual(selectWaGroups(W20_CONFIG, ["free"], "live"));
    expect(m.uploadLandingVoucher).not.toHaveBeenCalled();
    expect(inputOf()).toMatchObject({ voucherUrl: "" });
    expect(inputOf().quote).toMatchObject({ isFree: true, total: 0 });
  });
});

describe("POST /api/landing/[slug]/register: refusals", () => {
  it("400 for a missing or broken payload", async () => {
    expect((await submit("{not json")).status).toBe(400);
    const empty = await register(new Request("http://x", { method: "POST", body: new FormData() }) as never, ctx());
    expect(empty.status).toBe(400);
    nothingStored();
  });
  it("400 with the field for a schema error", async () => {
    const res = await submit(ppcPayload({ lead: { ...ppcPayload().lead, email: "bad" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("lead.email");
    nothingStored();
  });
  it("a filled honeypot is a bare 400", async () => {
    const res = await submit({ ...ppcPayload(), honeypot: "http://spam.example" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    nothingStored();
  });
  it("422 with the field when the choice cannot be priced", async () => {
    const res = await submit(ppcPayload({ regionKey: "XX" }));
    expect(res.status).toBe(422);
    expect((await res.json()).field).toBe("regionKey");
    nothingStored();
  });
  it("400 when the payment account is not one of the region's", async () => {
    const res = await submit(ppcPayload({ paymentMethod: "paypal" }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("paymentMethod");
    nothingStored();
  });
  it("checks the payment account against the central list of the chosen region", async () => {
    m.resolveAccountKeysSafe.mockResolvedValue({ PK: ["hbl"], UAE: ["mashreq"], KSA: ["paypal"], INTL: ["paypal"] });
    expect((await submit(ppcPayload({ paymentMethod: "hbl" }))).status).toBe(201);
    expect(inputOf().payload.paymentMethod).toBe("hbl");
    expect(m.resolveAccountKeysSafe).toHaveBeenCalledWith([PPC_CONFIG.regions.find((r) => r.key === "PK")]);
  });
  it("rejects a hidden account and one from another region (400, paymentMethod)", async () => {
    m.resolveAccountKeysSafe.mockResolvedValue({ PK: ["hbl"], UAE: ["mashreq"], KSA: ["paypal"], INTL: ["paypal"] });
    for (const paymentMethod of ["faysal", "mashreq"]) {
      const res = await submit(ppcPayload({ paymentMethod }));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe("paymentMethod");
    }
    nothingStored();
  });
  it("voucher rules: required, size, type, upload failure", async () => {
    const missing = await submit(ppcPayload(), null);
    expect(missing.status).toBe(400);
    expect((await missing.json()).field).toBe("voucher");
    expect((await submit(ppcPayload(), png(MAX_VOUCHER_UPLOAD_BYTES + 1))).status).toBe(413);
    expect((await submit(ppcPayload(), png(100, "text/plain"))).status).toBe(415);
    expect(m.uploadLandingVoucher).not.toHaveBeenCalled();
    m.uploadLandingVoucher.mockResolvedValue({ ok: false, message: "Drive down" });
    const failed = await submit(ppcPayload());
    expect(failed.status).toBe(502);
    expect((await failed.json()).field).toBe("voucher");
    expect(m.createRegistration).not.toHaveBeenCalled();
  });
  it("409 on a closed page, 404 on a draft or with registration off", async () => {
    m.getRegistrablePage.mockResolvedValue(page(PPC_CONFIG, { status: "closed" }));
    expect((await submit(ppcPayload())).status).toBe(409);
    m.getRegistrablePage.mockResolvedValue(null);
    expect((await submit(ppcPayload())).status).toBe(404);
    m.getRegistrablePage.mockResolvedValue(page({ ...PPC_CONFIG, enabled: false }));
    expect((await submit(ppcPayload())).status).toBe(404);
    nothingStored();
  });
  it("409 when the event is full, 500 on a database error", async () => {
    m.createRegistration.mockResolvedValue({ ok: false, reason: "capacity_full" });
    const full = await submit(ppcPayload());
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatch(/full/);
    m.createRegistration.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await submit(ppcPayload())).status).toBe(500);
    expect(m.enqueueJobs).not.toHaveBeenCalled();
  });
});

describe("test mode (admin only, ruling 2)", () => {
  it("refuses a visitor who is not an admin, before anything is uploaded or stored", async () => {
    const res = await submit(ppcPayload({ testMode: true }));
    expect(res.status).toBe(403);
    nothingStored();
  });
  it("an admin's test is marked as a test, mails only that admin and skips the sheet and the duplicate checks", async () => {
    m.requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-1", email: "admin@pz.test" } });
    m.createRegistration.mockResolvedValue({ ok: true, refId: "TEST-12345", registrationIds: ["reg-9"], total: 4800, currency: "PKR" });
    const res = await submit(ppcPayload({ testMode: true }));
    expect(res.status).toBe(201);
    expect((await res.json()).refId).toBe("TEST-12345");
    expect(inputOf()).toMatchObject({ isTest: true, studentId: "admin-1" });
    expect(m.enqueueJobs).toHaveBeenCalledWith("reg-9", ["email_received", "email_admin"]);
    expect(m.findRecentRegistration).not.toHaveBeenCalled();
    expect(m.findOpenRegistration).not.toHaveBeenCalled();
    expect(m.countRecentRegistrations).not.toHaveBeenCalled();
  });
  it("a test registration never carries agent attribution, from a link or from a promo owner", async () => {
    m.requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-1", email: "admin@pz.test" } });
    m.createRegistration.mockResolvedValue({ ok: true, refId: "TEST-12345", registrationIds: ["reg-9"], total: 4800, currency: "PKR" });
    m.resolveAgentCode.mockResolvedValue({ agentId: "agent-1" });
    m.getPromoByCode.mockResolvedValue(promo({ ownerAgentId: "agent-7" }));
    const res = await submit(ppcPayload({ testMode: true, promoCode: "PZ10", attribution: { ...ppcPayload().attribution, refCode: "ayesha-7k2" } }));
    expect(res.status).toBe(201);
    expect(inputOf().isTest).toBe(true);
    expect(inputOf().agentId).toBeNull();
  });
  it("an admin can test a closed page", async () => {
    m.requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    m.getRegistrablePage.mockResolvedValue(page(PPC_CONFIG, { status: "closed" }));
    expect((await submit(ppcPayload({ testMode: true }))).status).toBe(201);
  });
});

describe("promo codes", () => {
  it("applies a valid code and hands it to the RPC for atomic use", async () => {
    m.getPromoByCode.mockResolvedValue(promo());
    const res = await submit(ppcPayload({ promoCode: "pz10" }));
    expect(m.getPromoByCode).toHaveBeenCalledWith("PZ10");
    expect(inputOf().promo).toMatchObject({ ok: true, promoId: "promo-1", total: 4320 });
    expect((await res.json()).total).toBe(4320);
  });
  it("422 for a code that does not apply, before any upload", async () => {
    const res = await submit(ppcPayload({ promoCode: "NOPE" }));
    expect(res.status).toBe(422);
    expect((await res.json()).field).toBe("promoCode");
    nothingStored();
  });
  it("one use per email", async () => {
    m.getPromoByCode.mockResolvedValue(promo({ oneperEmail: true }));
    m.emailUsedPromo.mockResolvedValue(true);
    expect((await submit(ppcPayload({ promoCode: "PZ10" }))).status).toBe(422);
    expect(m.emailUsedPromo).toHaveBeenCalledWith("promo-1", "ayesha@example.com");
  });
  it("409 when the last use went to someone else a moment ago", async () => {
    m.getPromoByCode.mockResolvedValue(promo({ maxUses: 1 }));
    m.createRegistration.mockResolvedValue({ ok: false, reason: "promo_exhausted" });
    const res = await submit(ppcPayload({ promoCode: "PZ10" }));
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe("promoCode");
  });
  it("a code owned by an agent credits that agent when there is no agent link", async () => {
    m.getPromoByCode.mockResolvedValue(promo({ ownerAgentId: "agent-7" }));
    await submit(ppcPayload({ promoCode: "PZ10" }));
    expect(inputOf().agentId).toBe("agent-7");
  });
});

describe("attribution and the signed-in person", () => {
  it("resolves the agent link code", async () => {
    m.resolveAgentCode.mockResolvedValue({ agentId: "agent-1" });
    await submit(ppcPayload({ attribution: { ...ppcPayload().attribution, refCode: "ayesha-7k2" } }));
    expect(m.resolveAgentCode).toHaveBeenCalledWith("ayesha-7k2");
    expect(inputOf().agentId).toBe("agent-1");
  });
  it("links a signed-in person only when the email matches the lead's", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "Ayesha@Example.com" } } });
    await submit(ppcPayload());
    expect(inputOf().studentId).toBe("user-1");
    m.createRegistration.mockClear();
    m.getUser.mockResolvedValue({ data: { user: { id: "user-2", email: "someone@else.com" } } });
    await submit(ppcPayload());
    expect(inputOf().studentId).toBeNull();
  });
});

describe("double submits and duplicates", () => {
  it("a repeated submit answers with the first registration and stores nothing", async () => {
    m.findRecentRegistration.mockResolvedValue(recent());
    const res = await submit(ppcPayload());
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ refId: "PZA-PPC-007", total: 4800, currency: "PKR" });
    expect(m.findRecentRegistration).toHaveBeenCalledWith("page-1", "ayesha@example.com", "2026-10-13T09:45:00.000Z");
    nothingStored();
  });
  it("a retry with a new event id but the same choice is also answered from the first one", async () => {
    m.findRecentRegistration.mockResolvedValue(recent({ eventId: "evt-other" }));
    expect((await (await submit(ppcPayload())).json()).refId).toBe("PZA-PPC-007");
    nothingStored();
  });
  it("409 when the email already has an open registration for this event, without revealing its reference", async () => {
    m.findRecentRegistration.mockResolvedValue(recent({ eventId: "evt-other", tierKey: "g3", groupSize: 3 }));
    m.findOpenRegistration.mockResolvedValue({ id: "r1", refId: "PZA-PPC-007", status: "pending" });
    const res = await submit(ppcPayload());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.field).toBe("lead.email");
    expect(JSON.stringify(body)).not.toContain("PZA-PPC-007");
    nothingStored();
  });
  it("429 after three registrations from one email in ten minutes", async () => {
    m.countRecentRegistrations.mockResolvedValue(3);
    expect((await submit(ppcPayload())).status).toBe(429);
    expect(m.countRecentRegistrations).toHaveBeenCalledWith("ayesha@example.com", "2026-10-13T09:50:00.000Z");
    nothingStored();
  });
});

describe("hardening carry-overs", () => {
  it("any non-empty honeypot value is a bare 400, even a non-string", async () => {
    for (const honeypot of [true, 1, ["x"], { a: 1 }]) {
      const res = await submit({ ...ppcPayload(), honeypot });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    nothingStored();
  });
  it("a test registration never passes a promo to the RPC", async () => {
    m.requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    m.getPromoByCode.mockResolvedValue(promo());
    await submit(ppcPayload({ testMode: true, promoCode: "PZ10" }));
    expect(inputOf().promo).toBeNull();
  });
  it("a zero-discount promo does not credit its owner agent", async () => {
    m.getPromoByCode.mockResolvedValue(promo({ type: "percent", value: 0, ownerAgentId: "agent-7" }));
    await submit(ppcPayload({ promoCode: "PZ10" }));
    expect(inputOf().agentId).toBeNull();
  });
  it("500 when the RPC returns a different number of ids than rows sent", async () => {
    m.createRegistration.mockResolvedValue({ ok: true, refId: "PZA-PPC-001", registrationIds: ["a", "b"], total: 4800, currency: "PKR" });
    const spyErr = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await submit(ppcPayload())).status).toBe(500);
    expect(m.enqueueJobs).not.toHaveBeenCalled();
    // The orphan can be found by its reference and first row id, with no personal data in the log.
    const logged = spyErr.mock.calls.flat().join(" ");
    expect(logged).toContain("PZA-PPC-001");
    expect(spyErr.mock.calls.some((c) => c.includes("PZA-PPC-001") && c.includes("a"))).toBe(true);
    expect(logged).not.toContain("@");
    spyErr.mockRestore();
  });
  it("retries a failed enqueue once, then runs the jobs directly instead of losing them", async () => {
    m.enqueueJobs.mockResolvedValue(false);
    const res = await submit(ppcPayload());
    expect(res.status).toBe(201);
    expect(m.enqueueJobs).toHaveBeenCalledTimes(2);
    expect(m.runJobsDirect).toHaveBeenCalledWith("reg-1", ["email_received", "sheet_append", "email_admin"]);
    expect(m.runJobsFor).not.toHaveBeenCalled();
  });
  it("a second enqueue that succeeds goes back to the normal path", async () => {
    m.enqueueJobs.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await submit(ppcPayload());
    expect(m.runJobsFor).toHaveBeenCalledWith("reg-1");
    expect(m.runJobsDirect).not.toHaveBeenCalled();
  });
});
