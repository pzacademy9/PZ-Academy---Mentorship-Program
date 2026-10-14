// @vitest-environment node
// tests/landing-public-routes.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PPC_CONFIG, W20_CONFIG, PRE_EB, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { PromoCode } from "@/lib/landing/registration/promo";
import { toPublicRegistration, regionAccountKeys, QUOTE_ERRORS } from "@/lib/landing/registration/public-config";
import { isPublicSlug, statusQuerySchema } from "@/lib/validations/landing-public";

const m = vi.hoisted(() => ({
  getRegistrablePage: vi.fn(),
  listPaymentAccounts: vi.fn(),
  getPromoByCode: vi.fn(),
  emailUsedPromo: vi.fn(),
  getRegistrationStatus: vi.fn(),
  resolveAgentCode: vi.fn(),
  recordFunnelEvent: vi.fn(),
  getUser: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePage: m.getRegistrablePage }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/data/landing-promo-codes", () => ({ getPromoByCode: m.getPromoByCode, emailUsedPromo: m.emailUsedPromo }));
vi.mock("@/lib/data/landing-registrations", () => ({ getRegistrationStatus: m.getRegistrationStatus }));
vi.mock("@/lib/data/landing-agent-links", () => ({ resolveAgentCode: m.resolveAgentCode }));
vi.mock("@/lib/data/landing-funnel", () => ({ recordFunnelEvent: m.recordFunnelEvent }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: m.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.profile }) }) }),
  }),
}));

import { GET as config } from "@/app/api/landing/[slug]/config/route";
import { POST as quote } from "@/app/api/landing/[slug]/quote/route";
import { GET as status } from "@/app/api/landing/[slug]/status/route";
import { POST as event } from "@/app/api/landing/[slug]/event/route";
import { GET as me } from "@/app/api/landing/me/route";

const AFTER_EB = new Date("2026-10-16T10:00:00Z");
const ctx = (slug = "ppc-b4") => ({ params: Promise.resolve({ slug }) });
const page = (registration: RegistrationConfig = PPC_CONFIG, over: Record<string, unknown> = {}) => ({
  id: "page-1", slug: "ppc-b4", title: "PPC Batch 4", status: "published", content: contentWith(registration), registration,
  sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", courseId: null, ...over,
});
const getReq = (url = "http://x/api/landing/ppc-b4/config", headers: Record<string, string> = {}) => new Request(url, { headers }) as never;
const postReq = (body: unknown) =>
  new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const promo = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "promo-1", code: "PZ10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const quoteBody = (over: Record<string, unknown> = {}) => ({
  regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, ...over,
});

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PRE_EB);
  m.getRegistrablePage.mockResolvedValue(page());
  m.listPaymentAccounts.mockResolvedValue([{ key: "faysal", label: "Faysal Bank", kind: "bank", rows: [], displayText: "" }]);
  m.recordFunnelEvent.mockResolvedValue(undefined);
  m.resolveAgentCode.mockResolvedValue(null);
  m.getUser.mockResolvedValue({ data: { user: null } });
});
afterEach(() => vi.useRealTimers());

describe("pure helpers", () => {
  it("the public copy hides group links and the ref prefix without touching the stored config", () => {
    const pub = toPublicRegistration(PPC_CONFIG, PRE_EB);
    expect(pub.options.map((o) => o.waGroupUrl)).toEqual(PPC_CONFIG.options.map(() => ""));
    expect(pub.refPrefix).toBe("");
    expect(pub.earlyBirdActive).toBe(true);
    expect(pub.prices).toEqual(PPC_CONFIG.prices);
    expect(PPC_CONFIG.options[0].waGroupUrl).not.toBe("");
    expect(toPublicRegistration(PPC_CONFIG, AFTER_EB).earlyBirdActive).toBe(false);
  });
  it("lists each region account once, in region order", () => {
    expect(regionAccountKeys(PPC_CONFIG)).toEqual(["faysal", "easypaisa", "mashreq", "paypal"]);
  });
  it("has a message and a field for every quote failure", () => {
    for (const v of Object.values(QUOTE_ERRORS)) {
      expect(v.message.length).toBeGreaterThan(10);
      expect(v.field.length).toBeGreaterThan(0);
    }
  });
  it("validates slugs and status queries", () => {
    expect(isPublicSlug("ppc-b4")).toBe(true);
    expect(isPublicSlug("Bad Slug!")).toBe(false);
    expect(isPublicSlug("ab")).toBe(false);
    expect(statusQuerySchema.parse({ ref: " pza-ppc-001 ", email: " Ayesha@Example.com " })).toEqual({ ref: "PZA-PPC-001", email: "ayesha@example.com" });
    expect(statusQuerySchema.safeParse({ ref: "x", email: "ayesha@example.com" }).success).toBe(false);
  });
});

describe("GET /api/landing/[slug]/config", () => {
  it("returns the public config, the region accounts and the visitor's country", async () => {
    const res = await config(getReq(undefined, { "x-vercel-ip-country": "ae" }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ pageId: "page-1", status: "published", country: "AE" });
    expect(body.accounts).toHaveLength(1);
    expect(body.registration.earlyBirdActive).toBe(true);
    expect(body.registration.options.every((o: { waGroupUrl: string }) => o.waGroupUrl === "")).toBe(true);
    expect(body.registration.refPrefix).toBe("");
    expect(m.getRegistrablePage).toHaveBeenCalledWith("ppc-b4");
    expect(m.listPaymentAccounts).toHaveBeenCalledWith(["faysal", "easypaisa", "mashreq", "paypal"]);
  });
  it("judges Early Bird on the server clock", async () => {
    vi.setSystemTime(AFTER_EB);
    expect((await (await config(getReq(), ctx())).json()).registration.earlyBirdActive).toBe(false);
  });
  it("country is null when the header is missing or malformed", async () => {
    expect((await (await config(getReq(), ctx())).json()).country).toBeNull();
    expect((await (await config(getReq(undefined, { "x-vercel-ip-country": "Pakistan" }), ctx())).json()).country).toBeNull();
  });
  it("a closed page still answers, with status closed", async () => {
    m.getRegistrablePage.mockResolvedValue(page(PPC_CONFIG, { status: "closed" }));
    const res = await config(getReq(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("closed");
  });
  it("404 for drafts, unknown pages, malformed slugs and pages without registration", async () => {
    m.getRegistrablePage.mockResolvedValue(null);
    expect((await config(getReq(), ctx())).status).toBe(404);
    m.getRegistrablePage.mockResolvedValue(page({ ...PPC_CONFIG, enabled: false }));
    const off = await config(getReq(), ctx());
    expect(off.status).toBe(404);
    expect((await off.json()).error).toBe("Registration is not open on this page.");
    m.getRegistrablePage.mockClear();
    expect((await config(getReq(), ctx("Bad Slug!"))).status).toBe(404);
    expect(m.getRegistrablePage).not.toHaveBeenCalled();
    expect(m.listPaymentAccounts).not.toHaveBeenCalled();
  });
  it("500 when the page or the accounts cannot be read", async () => {
    m.getRegistrablePage.mockRejectedValue(new Error("down"));
    expect((await config(getReq(), ctx())).status).toBe(500);
    m.getRegistrablePage.mockResolvedValue(page());
    m.listPaymentAccounts.mockRejectedValue(new Error("down"));
    expect((await config(getReq(), ctx())).status).toBe(500);
  });
});

describe("POST /api/landing/[slug]/quote", () => {
  it("prices on the server and ignores any client total", async () => {
    const res = await quote(postReq(quoteBody({ total: 1 })), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.quote).toMatchObject({ ok: true, currency: "PKR", total: 4800, earlyBirdApplied: true });
    expect(body.promo).toBeUndefined();
    expect(m.getPromoByCode).not.toHaveBeenCalled();
  });
  it("uses the regular price once the Early Bird instant has passed", async () => {
    vi.setSystemTime(AFTER_EB);
    expect((await (await quote(postReq(quoteBody()), ctx())).json()).quote).toMatchObject({ ok: true, total: 6000, earlyBirdApplied: false });
  });
  it("returns a failed quote as data", async () => {
    expect((await (await quote(postReq(quoteBody({ regionKey: "XX" })), ctx())).json()).quote).toEqual({ ok: false, reason: "no_region" });
  });
  it("400 for a malformed body", async () => {
    expect((await quote(postReq(quoteBody({ groupSize: 0 })), ctx())).status).toBe(400);
    expect((await quote(postReq("not json"), ctx())).status).toBe(400);
  });
  it("applies a valid promo after the price", async () => {
    m.getPromoByCode.mockResolvedValue(promo());
    const body = await (await quote(postReq(quoteBody({ promoCode: " pz10 " })), ctx())).json();
    expect(m.getPromoByCode).toHaveBeenCalledWith("PZ10");
    expect(body.promo).toMatchObject({ ok: true, code: "PZ10", discount: 480, total: 4320 });
  });
  it("reports an unknown code", async () => {
    m.getPromoByCode.mockResolvedValue(null);
    expect((await (await quote(postReq(quoteBody({ promoCode: "NOPE" })), ctx())).json()).promo).toEqual({ ok: false, reason: "unknown" });
  });
  it("checks one-per-email codes only when an email is given", async () => {
    m.getPromoByCode.mockResolvedValue(promo({ oneperEmail: true }));
    m.emailUsedPromo.mockResolvedValue(true);
    const used = await (await quote(postReq(quoteBody({ promoCode: "PZ10", email: " Ayesha@Example.com " })), ctx())).json();
    expect(used.promo).toEqual({ ok: false, reason: "already_used" });
    expect(m.emailUsedPromo).toHaveBeenCalledWith("promo-1", "ayesha@example.com");
    m.emailUsedPromo.mockClear();
    const noEmail = await (await quote(postReq(quoteBody({ promoCode: "PZ10" })), ctx())).json();
    expect(noEmail.promo.ok).toBe(true);
    expect(m.emailUsedPromo).not.toHaveBeenCalled();
  });
  it("free options skip the promo lookup", async () => {
    m.getRegistrablePage.mockResolvedValue(page(W20_CONFIG));
    const body = await (await quote(postReq(quoteBody({ optionKeys: ["free"], promoCode: "PZ10" })), ctx())).json();
    expect(body.quote).toMatchObject({ ok: true, isFree: true, total: 0 });
    expect(body.promo).toBeUndefined();
    expect(m.getPromoByCode).not.toHaveBeenCalled();
  });
  it("a closed page still quotes", async () => {
    m.getRegistrablePage.mockResolvedValue(page(PPC_CONFIG, { status: "closed" }));
    expect((await quote(postReq(quoteBody()), ctx())).status).toBe(200);
  });
  it("500 when the promo lookup fails", async () => {
    m.getPromoByCode.mockRejectedValue(new Error("down"));
    expect((await quote(postReq(quoteBody({ promoCode: "PZ10" })), ctx())).status).toBe(500);
  });
});

describe("GET /api/landing/[slug]/status", () => {
  const statusReq = (q: string) => getReq(`http://x/api/landing/ppc-b4/status?${q}`);
  it("looks up ref + email, normalized", async () => {
    m.getRegistrationStatus.mockResolvedValue({ status: "pending", name: "Ayesha Khan", eventLabel: "PPC Batch 3" });
    const res = await status(statusReq("ref=pza-ppc-001&email=Ayesha%40Example.com"), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "pending", name: "Ayesha Khan", eventLabel: "PPC Batch 3" });
    expect(m.getRegistrationStatus).toHaveBeenCalledWith("PZA-PPC-001", "ayesha@example.com", "page-1");
  });
  it("only finds registrations of the page in the URL: another event's ref is 404", async () => {
    m.getRegistrationStatus.mockImplementation(async (_ref: string, _email: string, pageId?: string) =>
      (pageId === "page-2" ? { status: "paid", name: "Ayesha Khan", eventLabel: "MDC Workshop" } : null));
    const res = await status(statusReq("ref=PZA-MDC-001&email=ayesha%40example.com"), ctx());
    expect(res.status).toBe(404);
    expect(m.getRegistrationStatus).toHaveBeenCalledWith("PZA-MDC-001", "ayesha@example.com", "page-1");
  });
  it("404 when the pair does not match, 400 for bad input, 500 on a read error", async () => {
    m.getRegistrationStatus.mockResolvedValue(null);
    expect((await status(statusReq("ref=PZA-PPC-001&email=x%40y.com"), ctx())).status).toBe(404);
    expect((await status(statusReq("ref=&email=x%40y.com"), ctx())).status).toBe(400);
    expect((await status(statusReq("ref=PZA-PPC-001&email=nope"), ctx())).status).toBe(400);
    m.getRegistrationStatus.mockRejectedValue(new Error("down"));
    expect((await status(statusReq("ref=PZA-PPC-001&email=x%40y.com"), ctx())).status).toBe(500);
  });
  it("works after registration is switched off, but not for drafts", async () => {
    m.getRegistrationStatus.mockResolvedValue({ status: "paid", name: "A", eventLabel: "E" });
    m.getRegistrablePage.mockResolvedValue(page({ ...PPC_CONFIG, enabled: false }, { status: "closed" }));
    expect((await status(statusReq("ref=PZA-PPC-001&email=x%40y.com"), ctx())).status).toBe(200);
    m.getRegistrablePage.mockResolvedValue(null);
    m.getRegistrationStatus.mockClear();
    expect((await status(statusReq("ref=PZA-PPC-001&email=x%40y.com"), ctx())).status).toBe(404);
    expect(m.getRegistrationStatus).not.toHaveBeenCalled();
  });
});

describe("POST /api/landing/[slug]/event", () => {
  it("records the event with cleaned UTMs and the agent behind the ref code", async () => {
    m.resolveAgentCode.mockResolvedValue({ agentId: "agent-1" });
    const res = await event(postReq({ sessionId: "sess-0001-abcd", type: "view", utm: { utm_source: " fb ", evil: "x" }, ref: "ayesha-7k2" }), ctx());
    expect(res.status).toBe(204);
    expect(m.resolveAgentCode).toHaveBeenCalledWith("ayesha-7k2");
    expect(m.recordFunnelEvent).toHaveBeenCalledWith({
      pageId: "page-1", sessionId: "sess-0001-abcd", type: "view", utm: { utm_source: "fb" }, agentId: "agent-1",
    });
  });
  it("accepts a beacon without a ref and records views on a closed page", async () => {
    m.getRegistrablePage.mockResolvedValue(page(PPC_CONFIG, { status: "closed" }));
    expect((await event(postReq({ sessionId: "1760349600000-abcd1234", type: "start" }), ctx())).status).toBe(204);
    expect(m.resolveAgentCode).not.toHaveBeenCalled();
    expect(m.recordFunnelEvent.mock.calls[0][0]).toMatchObject({ type: "start", utm: {}, agentId: null });
  });
  it("400 for an unknown type, a bad session id or a non-JSON body", async () => {
    expect((await event(postReq({ sessionId: "sess-0001-abcd", type: "purchase" }), ctx())).status).toBe(400);
    expect((await event(postReq({ sessionId: "short", type: "view" }), ctx())).status).toBe(400);
    expect((await event(postReq("not json"), ctx())).status).toBe(400);
    expect(m.recordFunnelEvent).not.toHaveBeenCalled();
  });
  it("404 for a draft page", async () => {
    m.getRegistrablePage.mockResolvedValue(null);
    expect((await event(postReq({ sessionId: "sess-0001-abcd", type: "view" }), ctx())).status).toBe(404);
  });
});

describe("GET /api/landing/me", () => {
  it("is null for a guest, never cached", async () => {
    const res = await me();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toBeNull();
  });
  it("returns the signed-in person's prefill", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "ayesha@example.com" } } });
    m.profile.mockResolvedValue({ data: { full_name: "Ayesha Khan", phone: "+923001234567", profession: "Pharmacist" }, error: null });
    expect(await (await me()).json()).toEqual({ name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist" });
  });
  it("is null when the session cannot be read", async () => {
    m.getUser.mockRejectedValue(new Error("cookies"));
    expect(await (await me()).json()).toBeNull();
  });
});
