import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => gate.result,
  requireAdminPage: async () => ({ user: { id: "admin-user" }, supabase: {} }),
}));
const data = vi.hoisted(() => ({
  createLandingPage: vi.fn(), saveDraft: vi.fn(), publishLandingPage: vi.fn(), rollbackLandingPage: vi.fn(),
  duplicateLandingPage: vi.fn(), setPageStatus: vi.fn(), renameLandingPage: vi.fn(), getLandingPage: vi.fn(), listVersions: vi.fn(),
}));
vi.mock("@/lib/data/landing-pages", () => data);
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: vi.fn() }));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter" }) }));
vi.mock("@/components/admin/landing/LandingEditor", () => ({ LandingEditor: () => null }));
vi.mock("@/components/admin/landing/PreviewTarget", () => ({ PreviewTarget: () => null }));
// Phase 2 admin routes: a refused gate must leave every one of these untouched.
const extra = vi.hoisted(() => ({
  getPageSheetInfo: vi.fn(), saveEventSheet: vi.fn(), createEventSheet: vi.fn(),
  retryFailedJobs: vi.fn(), drainDueJobs: vi.fn(), makeWaitingJobsDue: vi.fn(), requeueSheetAppendJobs: vi.fn(), runInBackground: vi.fn(),
  listPromoCodes: vi.fn(), createPromoCode: vi.fn(), updatePromoCode: vi.fn(), getPromoById: vi.fn(), getOrCreateAgentLink: vi.fn(),
  getPageJobSummary: vi.fn(),
  createPaymentAccount: vi.fn(), updatePaymentAccount: vi.fn(), createPaymentCountry: vi.fn(), updatePaymentCountry: vi.fn(), setCountryAccounts: vi.fn(),
}));
vi.mock("@/lib/data/landing-event-sheet", () => ({ getPageSheetInfo: extra.getPageSheetInfo, saveEventSheet: extra.saveEventSheet }));
vi.mock("@/lib/gas/event-sheet-client", () => ({ createEventSheet: extra.createEventSheet }));
vi.mock("@/lib/data/landing-jobs", () => ({
  retryFailedJobs: extra.retryFailedJobs, drainDueJobs: extra.drainDueJobs,
  makeWaitingJobsDue: extra.makeWaitingJobsDue, requeueSheetAppendJobs: extra.requeueSheetAppendJobs,
}));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: extra.runInBackground }));
vi.mock("@/lib/data/landing-ops", () => ({ getPageJobSummary: extra.getPageJobSummary }));
vi.mock("@/lib/data/landing-promo-codes", () => ({
  listPromoCodes: extra.listPromoCodes, createPromoCode: extra.createPromoCode, updatePromoCode: extra.updatePromoCode, getPromoById: extra.getPromoById,
}));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ createPaymentAccount: extra.createPaymentAccount, updatePaymentAccount: extra.updatePaymentAccount }));
vi.mock("@/lib/data/landing-payment-countries", () => ({
  createPaymentCountry: extra.createPaymentCountry, updatePaymentCountry: extra.updatePaymentCountry, setCountryAccounts: extra.setCountryAccounts,
}));
vi.mock("@/lib/data/landing-agent-links", () => ({
  getOrCreateAgentLink: extra.getOrCreateAgentLink,
  AgentLinkError: class AgentLinkError extends Error {},
}));

import { POST as create } from "@/app/api/admin/landing-pages/route";
import { PATCH as patchDraft } from "@/app/api/admin/landing-pages/[id]/route";
import { POST as publish } from "@/app/api/admin/landing-pages/[id]/publish/route";
import { POST as rollback } from "@/app/api/admin/landing-pages/[id]/rollback/route";
import { POST as duplicate } from "@/app/api/admin/landing-pages/[id]/duplicate/route";
import { POST as status } from "@/app/api/admin/landing-pages/[id]/status/route";
import { POST as rename } from "@/app/api/admin/landing-pages/[id]/rename/route";
import EditorPage from "@/app/dashboard/admin/landing-pages/[id]/page";
import PreviewPage from "@/app/dashboard/admin/landing-pages/[id]/preview/page";
import { POST as createSheet } from "@/app/api/admin/landing-pages/[id]/sheet/route";
import { POST as retryJobs } from "@/app/api/admin/landing-pages/[id]/jobs/retry/route";
import { GET as listJobs } from "@/app/api/admin/landing-pages/[id]/jobs/route";
import { GET as listPromos, POST as createPromo } from "@/app/api/admin/landing-promo-codes/route";
import { PATCH as patchPromo } from "@/app/api/admin/landing-promo-codes/[id]/route";
import { POST as agentLink } from "@/app/api/admin/landing-agent-links/route";
import { POST as createPaymentAccountRoute } from "@/app/api/admin/payment-accounts/route";
import { PATCH as patchPaymentAccountRoute } from "@/app/api/admin/payment-accounts/[key]/route";
import { POST as createPaymentCountryRoute } from "@/app/api/admin/payment-countries/route";
import { PATCH as patchPaymentCountryRoute } from "@/app/api/admin/payment-countries/[regionKey]/route";
import { PUT as putCountryAccountsRoute } from "@/app/api/admin/payment-countries/[regionKey]/accounts/route";
import { GET as listVariantsRoute, POST as createVariantRoute } from "@/app/api/admin/landing-pages/[id]/variants/route";
import { PATCH as patchVariant, DELETE as deleteVariantRoute } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/route";
import { POST as publishVariantRoute } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/publish/route";
import { POST as rollbackVariantRoute } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/rollback/route";
import { GET as variantVersionsRoute } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/versions/route";
import { emptyContent } from "@/lib/landing/content";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: ID }) };
const vctx = { params: Promise.resolve({ id: ID, variantId: ID }) };
const req = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) }) as never;

// One entry per landing admin route file. A new route under landing-pages must be added here (the
// "covers every route file" test fails until it is).
const ROUTES: Record<string, () => Promise<Response>> = {
  "landing-pages/route.ts": () => create(req({ title: "PPC Batch 4", kind: "course" })),
  "landing-pages/[id]/route.ts": () => patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), ctx),
  "landing-pages/[id]/publish/route.ts": () => publish(req({}), ctx),
  "landing-pages/[id]/rollback/route.ts": () => rollback(req({ version: 1 }), ctx),
  "landing-pages/[id]/duplicate/route.ts": () => duplicate(req({ title: "Copy" }), ctx),
  "landing-pages/[id]/status/route.ts": () => status(req({ status: "closed" }), ctx),
  "landing-pages/[id]/rename/route.ts": () => rename(req({ title: "New name" }), ctx),
  "landing-pages/[id]/sheet/route.ts": () => createSheet(req({}), ctx),
  "landing-pages/[id]/jobs/retry/route.ts": () => retryJobs(req({}), ctx),
  "landing-pages/[id]/jobs/route.ts": () => listJobs(new Request("http://x") as never, ctx),
  "landing-pages/[id]/variants/route.ts": () => createVariantRoute(req({ regionKey: "UAE", moduleKey: null, enabled: true }), ctx),
  "landing-pages/[id]/variants/[variantId]/route.ts": () => patchVariant(req({ enabled: true }, "PATCH"), vctx),
  "landing-pages/[id]/variants/[variantId]/publish/route.ts": () => publishVariantRoute(req({}), vctx),
  "landing-pages/[id]/variants/[variantId]/rollback/route.ts": () => rollbackVariantRoute(req({ version: 1 }), vctx),
  "landing-pages/[id]/variants/[variantId]/versions/route.ts": () => variantVersionsRoute(new Request("http://x") as never, vctx),
  "landing-promo-codes/route.ts": () => createPromo(req({ code: "PZ10" })),
  "landing-promo-codes/[id]/route.ts": () => patchPromo(req({ active: false }, "PATCH"), ctx),
  "landing-agent-links/route.ts": () => agentLink(req({ agentId: ID })),
  "payment-accounts/route.ts": () => createPaymentAccountRoute(req({ label: "Faysal Bank", kind: "bank", rows: [{ label: "IBAN", value: "PK00" }], displayText: "" })),
  "payment-accounts/[key]/route.ts": () => patchPaymentAccountRoute(req({ active: false }, "PATCH"), { params: Promise.resolve({ key: "faysal_bank" }) }),
  "payment-countries/route.ts": () => createPaymentCountryRoute(req({ regionKey: "LK", name: "Sri Lanka" })),
  "payment-countries/[regionKey]/route.ts": () => patchPaymentCountryRoute(req({ active: false }, "PATCH"), { params: Promise.resolve({ regionKey: "PK" }) }),
  "payment-countries/[regionKey]/accounts/route.ts": () => putCountryAccountsRoute(req({ accountKeys: ["faysal_bank"] }, "PUT"), { params: Promise.resolve({ regionKey: "PK" }) }),
};
// A second handler in an already-listed route file (the coverage scan counts files, not handlers).
const EXTRA_HANDLERS: [string, () => Promise<Response>][] = [
  ["landing-promo-codes/route.ts GET", () => listPromos()],
  ["landing-pages/[id]/variants/route.ts GET", () => listVariantsRoute(new Request("http://x") as never, ctx)],
  ["landing-pages/[id]/variants/[variantId]/route.ts DELETE", () => deleteVariantRoute(new Request("http://x", { method: "DELETE" }) as never, vctx)],
];
const ADMIN_LANDING_DIRS = ["landing-pages", "landing-promo-codes", "landing-agent-links", "payment-accounts", "payment-countries"];

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

beforeEach(() => {
  for (const fn of Object.values(data)) fn.mockReset();
  for (const fn of Object.values(extra)) fn.mockReset();
});

describe("landing admin routes refuse anyone who is not an admin", () => {
  it("covers every landing route file under /api/admin", () => {
    const base = join(process.cwd(), "src", "app", "api", "admin");
    const found = ADMIN_LANDING_DIRS.flatMap((d) => routeFiles(join(base, d)))
      .map((f) => relative(base, f).replace(/[\\]/g, "/"))
      .sort();
    expect(found).toEqual(Object.keys(ROUTES).sort());
  });
  it.each([
    [401, "Not authenticated"],
    [403, "Forbidden"],
  ])("answers %s and touches no data", async (code, message) => {
    gate.result = { ok: false, response: NextResponse.json({ error: message }, { status: code }) };
    for (const [name, call] of [...Object.entries(ROUTES), ...EXTRA_HANDLERS]) {
      gate.result = { ok: false, response: NextResponse.json({ error: message }, { status: code }) };
      const res = await call();
      expect(res.status, name).toBe(code);
      expect((await res.json()).error, name).toBe(message);
    }
    for (const [name, fn] of Object.entries(data)) expect(fn, name).not.toHaveBeenCalled();
    for (const [name, fn] of Object.entries(extra)) expect(fn, name).not.toHaveBeenCalled();
  });
});

describe("admin pages for a malformed id", () => {
  it("the editor page 404s without querying the database", async () => {
    await expect(EditorPage({ params: Promise.resolve({ id: "not-a-uuid" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(data.getLandingPage).not.toHaveBeenCalled();
  });
  it("the preview page 404s without querying the database", async () => {
    await expect(PreviewPage({ params: Promise.resolve({ id: "not-a-uuid" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(data.getLandingPage).not.toHaveBeenCalled();
  });
});

describe("registration admin routes and malformed ids", () => {
  it("answer 404 after the gate and never reach the data layer", async () => {
    gate.result = { ok: true, user: { id: "admin-user" } };
    const bad = { params: Promise.resolve({ id: "not-a-uuid" }) };
    for (const [name, call] of [
      ["sheet", () => createSheet(req({}), bad)],
      ["retry", () => retryJobs(req({}), bad)],
      ["jobs", () => listJobs(new Request("http://x") as never, bad)],
    ] as const) {
      const res = await call();
      expect(res.status, name).toBe(404);
    }
    for (const [name, fn] of Object.entries(extra)) expect(fn, name).not.toHaveBeenCalled();
  });
});
