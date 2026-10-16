// @vitest-environment node
// tests/landing-variants-routes.test.ts
// The public API routes with a variant (`?v=`). The real landing-public / landing-variants data layers run
// over an in-memory fake of the admin Supabase client.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PPC_CONFIG, PRE_EB, ppcPayload } from "./helpers/landing-fixtures";
import { emptyContent, newSection, type LandingContent } from "@/lib/landing/content";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Res = { data: unknown; error: unknown };
interface Op { table: string; filters: [string, unknown][] }
let handler: (op: Op) => Res = () => ({ data: null, error: null });
function builder(table: string) {
  const op: Op = { table, filters: [] };
  const done = () => Promise.resolve(handler(op));
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => { op.filters.push([k, v]); return b; },
    maybeSingle: done,
    then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: builder }) }));

const m = vi.hoisted(() => ({
  listPaymentAccounts: vi.fn(),
  getPromoByCode: vi.fn(),
  emailUsedPromo: vi.fn(),
  resolveAgentCode: vi.fn(),
  requireAdmin: vi.fn(),
  getUser: vi.fn(),
  createRegistration: vi.fn(),
  findRecentRegistration: vi.fn(),
  findOpenRegistration: vi.fn(),
  countRecentRegistrations: vi.fn(),
  enqueueJobs: vi.fn(),
  runJobsFor: vi.fn(),
  runInBackground: vi.fn(),
  uploadLandingVoucher: vi.fn(),
}));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
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
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueJobs: m.enqueueJobs, runJobsFor: m.runJobsFor, runJobsDirect: vi.fn() }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: m.runInBackground }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ uploadLandingVoucher: m.uploadLandingVoucher }));

import { GET as config } from "@/app/api/landing/[slug]/config/route";
import { POST as quote } from "@/app/api/landing/[slug]/quote/route";
import { POST as register } from "@/app/api/landing/[slug]/register/route";

function mainContent(): LandingContent {
  const c = emptyContent("course");
  return {
    ...c,
    sections: [{ ...newSection("hero", "hero1"), data: { headline: "Main headline" } }],
    registration: PPC_CONFIG,
    modules: [{ key: "module-2", title: "Acute & Chronic Therapeutics", format: "2-Day Workshop", days: 2, optionKey: "m2" }],
  };
}
const pRow = (over: Record<string, unknown> = {}) => ({
  id: "page-1", slug: "ppc-b4", title: "PPC Batch 4", status: "published", published: mainContent(),
  sheet_id: "sheet-1", drive_folder_id: "folder-1", ref_prefix: "PPC", course_id: null, kind: "course", ...over,
});
const vRow = (region: string | null, mod: string | null, over: Record<string, unknown> = {}) => ({
  id: `v-${region}-${mod}`, page_id: "page-1", region_key: region, module_key: mod, enabled: true,
  draft: { sections: {} }, published: { sections: {} }, revision: 1, published_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
function db(opts: { page?: Record<string, unknown>; variants?: Record<string, unknown>[] } = {}) {
  const variants = opts.variants ?? [vRow("UAE", null), vRow("UAE", "module-2"), vRow(null, "module-2")];
  handler = (o) => {
    if (o.table === "landing_pages") return { data: pRow(opts.page), error: null };
    return { data: variants, error: null };
  };
}

const ctx = () => ({ params: Promise.resolve({ slug: "ppc-b4" }) });
const url = (path: string, v?: string) => `http://x/api/landing/ppc-b4/${path}${v === undefined ? "" : `?v=${encodeURIComponent(v)}`}`;
const getConfig = (v?: string) => config(new Request(url("config", v)) as never, ctx());
const postQuote = (body: unknown, v?: string) =>
  quote(new Request(url("quote", v), { method: "POST", body: JSON.stringify(body) }) as never, ctx());
const submit = (payload: unknown, v?: string) => {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  fd.append("voucher", new File([new Uint8Array(1024)], "shot.png", { type: "image/png" }));
  return register(new Request(url("register", v), { method: "POST", body: fd }) as never, ctx());
};
const quoteBody = (over: Record<string, unknown> = {}) => ({
  regionKey: "UAE", mode: "live", optionKeys: ["m2"], tierKey: "individual", groupSize: 1, ...over,
});

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PRE_EB);
  db();
  m.listPaymentAccounts.mockResolvedValue([]);
  m.getUser.mockResolvedValue({ data: { user: null } });
  m.requireAdmin.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  m.getPromoByCode.mockResolvedValue(null);
  m.resolveAgentCode.mockResolvedValue(null);
  m.findRecentRegistration.mockResolvedValue(null);
  m.findOpenRegistration.mockResolvedValue(null);
  m.countRecentRegistrations.mockResolvedValue(0);
  m.enqueueJobs.mockResolvedValue(undefined);
  m.runJobsFor.mockResolvedValue(undefined);
  m.uploadLandingVoucher.mockResolvedValue({ ok: true, url: "https://drive.google.com/file/d/v1/view" });
  m.createRegistration.mockImplementation(async (input: { quote: { total: number; currency: string } }) => ({
    ok: true, refId: "PZA-PPC-001", registrationIds: ["reg-1"], total: input.quote.total, currency: input.quote.currency,
  }));
});
afterEach(() => vi.useRealTimers());

describe("GET config with ?v=", () => {
  it("without v it is the main page (both regions)", async () => {
    const body = await (await getConfig()).json();
    expect(body.registration.regions).toHaveLength(2);
  });
  it("a region variant carries exactly that region", async () => {
    const res = await getConfig("uae");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registration.regions.map((r: { key: string }) => r.key)).toEqual(["UAE"]);
  });
  it("a region + module variant is narrowed to that module's option", async () => {
    const body = await (await getConfig("uae/module-2")).json();
    expect(body.registration.regions).toHaveLength(1);
    expect(body.registration.options.map((o: { key: string }) => o.key)).toEqual(["m2"]);
  });
  for (const bad of ["../x", "nope", "UAE/", "uae/module-2/x", "a b", "uae%2Fmodule-2", "x".repeat(81), "status", ""]) {
    it(`v=${JSON.stringify(bad.slice(0, 20))} is a plain 404 with no-store`, async () => {
      const res = await getConfig(bad);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ error: "Page not found" });
    });
  }
  it("a disabled variant link is 404", async () => {
    db({ variants: [vRow("UAE", null, { enabled: false })] });
    // The data layer filters on enabled = true, so the DB answers with no rows.
    handler = (o) => (o.table === "landing_pages" ? { data: pRow(), error: null } : { data: [], error: null });
    expect((await getConfig("uae")).status).toBe(404);
  });
  it("a never-published variant link is 404", async () => {
    db({ variants: [vRow("UAE", null, { published: null })] });
    expect((await getConfig("uae")).status).toBe(404);
  });
  it("a closed main page is closed for its variants", async () => {
    db({ page: { status: "closed" } });
    expect((await (await getConfig("uae")).json()).status).toBe("closed");
  });
});

describe("POST quote with ?v=", () => {
  it("prices against the narrowed config", async () => {
    const body = await (await postQuote(quoteBody(), "uae/module-2")).json();
    expect(body.quote).toMatchObject({ ok: true, total: 40, currency: "AED" });
  });
  it("a payload naming another option fails with the existing no_option error, not a price", async () => {
    const body = await (await postQuote(quoteBody({ optionKeys: ["m1"] }), "uae/module-2")).json();
    expect(body.quote).toMatchObject({ ok: false, reason: "no_option" });
  });
  it("a payload naming a region the variant dropped fails", async () => {
    const body = await (await postQuote(quoteBody({ regionKey: "PK" }), "uae")).json();
    expect(body.quote.ok).toBe(false);
  });
  it("an invalid v is 404", async () => {
    expect((await postQuote(quoteBody(), "nope")).status).toBe(404);
  });
});

describe("POST register with ?v=", () => {
  const regPayload = (over: Record<string, unknown> = {}) => ppcPayload({ regionKey: "UAE", optionKeys: ["m2"], paymentMethod: "mashreq", ...over } as never);
  it("stores variant_key for a variant registration", async () => {
    const res = await submit(regPayload(), "uae/module-2");
    expect(res.status).toBe(201);
    expect(m.createRegistration.mock.calls[0][0]).toMatchObject({ variantKey: "uae/module-2", page: { id: "page-1" } });
    expect(m.createRegistration.mock.calls[0][0].quote).toMatchObject({ ok: true, total: 40 });
  });
  it("stores an empty variant_key for the main page", async () => {
    await submit(ppcPayload());
    expect(m.createRegistration.mock.calls[0][0].variantKey).toBe("");
  });
  it("a payload naming another option is rejected and nothing is stored", async () => {
    const res = await submit(regPayload({ optionKeys: ["m1"] }), "uae/module-2");
    expect(res.status).toBe(422);
    expect(m.createRegistration).not.toHaveBeenCalled();
  });
  it("a closed main page blocks a variant registration", async () => {
    db({ page: { status: "closed" } });
    const res = await submit(regPayload(), "uae/module-2");
    expect(res.status).toBe(409);
    expect(m.createRegistration).not.toHaveBeenCalled();
  });
  it("an unknown variant is 404 and nothing is stored", async () => {
    expect((await submit(regPayload(), "nope")).status).toBe(404);
    expect(m.createRegistration).not.toHaveBeenCalled();
  });
});
