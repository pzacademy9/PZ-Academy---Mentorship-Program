// @vitest-environment node
// tests/landing-registration-flow.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, memoryHandler, type RpcHandler, type Store } from "./helpers/supabase-mock";
import { PPC_CONFIG, PRE_EB, contentWith, ppcPayload } from "./helpers/landing-fixtures";

const db = createSupabaseMock();
const m = vi.hoisted(() => ({
  background: [] as Promise<unknown>[],
  admin: null as unknown,
  upload: vi.fn(),
  append: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => m.admin }));
vi.mock("@/lib/gas/event-sheet-client", () => ({
  uploadLandingVoucher: m.upload,
  appendRegistrationRows: m.append,
  createEventSheet: async () => ({ ok: false, message: "not used" }),
}));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: m.send }));
vi.mock("@/lib/landing/registration/background", () => ({
  runInBackground: (task: Promise<unknown>) => {
    m.background.push(task);
  },
}));

import { GET as config } from "@/app/api/landing/[slug]/config/route";
import { POST as quote } from "@/app/api/landing/[slug]/quote/route";
import { POST as register } from "@/app/api/landing/[slug]/register/route";
import { GET as status } from "@/app/api/landing/[slug]/status/route";
import { linkRegistrationsToStudent } from "@/lib/data/landing-registrations";

const ctx = { params: Promise.resolve({ slug: "ppc-b4" }) };
const json = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never;
const form = (payload: unknown) => {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  fd.append("voucher", new File([new Uint8Array(64)], "shot.png", { type: "image/png" }));
  return new Request("http://x/api/landing/ppc-b4/register", { method: "POST", body: fd }) as never;
};
const refused = () => ({ ok: false, response: new Response(null, { status: 401 }) });

let store: Store;
let rpcCalls = 0;
let refCounter = 0;

const rpc: RpcHandler = (fn, args, s) => {
  if (fn !== "landing_create_registration") return { data: null, error: { message: `no rpc ${fn}` } };
  rpcCalls += 1;
  const a = args as { p_page_id: string; p_rows: Record<string, unknown>[]; p_promo_id: string | null; p_is_test: boolean };
  if (a.p_promo_id && !a.p_is_test) {
    const promo = s.landing_promo_codes.find((p) => p.id === a.p_promo_id);
    if (!promo || (promo.max_uses !== null && Number(promo.used_count) >= Number(promo.max_uses))) {
      return { data: null, error: { code: "P0001", message: "promo_exhausted" } };
    }
    promo.used_count = Number(promo.used_count) + 1;
  }
  const ref = a.p_is_test ? "TEST-12345" : `PZA-PPC-${String(++refCounter).padStart(3, "0")}`;
  const ids = a.p_rows.map((_, i) => `reg-${rpcCalls}-${i}`);
  a.p_rows.forEach((row, i) =>
    s.landing_registrations.push({
      ...row,
      id: ids[i],
      page_id: a.p_page_id,
      ref_id: i === 0 ? ref : null,
      lead_registration_id: i === 0 ? null : ids[0],
      promo_code_id: i === 0 && !a.p_is_test ? a.p_promo_id : null,
      is_test: a.p_is_test,
      amount_received: null,
      email_status: null,
      created_at: new Date().toISOString(),
    }),
  );
  return { data: { ref_id: ref, registration_ids: ids }, error: null };
};

const account = (key: string, label: string, kind: string) => ({ key, label, kind, active: true, sort: 0, rows: [{ label: "Account No.", value: "123" }], display_text: label });

function seed(): Store {
  return {
    landing_pages: [{
      id: "page-1", slug: "ppc-b4", title: "PPC Batch 4", status: "published", published: contentWith(PPC_CONFIG),
      sheet_id: "sheet-1", drive_folder_id: "folder-1", ref_prefix: "PPC", course_id: null,
    }],
    payment_accounts: [
      account("faysal", "Faysal Bank", "bank"), account("easypaisa", "EasyPaisa", "wallet"),
      account("mashreq", "Mashreq Bank", "bank"), account("paypal", "PayPal", "paypal"),
    ],
    landing_promo_codes: [{
      id: "promo-1", code: "PZ10", type: "percent", value: 10, fixed_amounts: {}, max_discount_percent: 0, page_ids: [], option_keys: [],
      max_uses: 100, used_count: 0, one_per_email: false, starts_at: null, ends_at: null, active: true, owner_agent_id: null,
      created_at: "2026-10-01T00:00:00Z",
    }],
    landing_registrations: [],
    landing_jobs: [],
    profiles: [],
  };
}

async function settle() {
  while (m.background.length > 0) await Promise.all(m.background.splice(0));
}

beforeEach(() => {
  db.reset();
  rpcCalls = 0;
  refCounter = 0;
  m.background.length = 0;
  store = seed();
  db.state.handler = memoryHandler(store, rpc);
  m.admin = refused();
  m.upload.mockReset().mockResolvedValue({ ok: true, url: "https://drive.google.com/file/d/v1/view" });
  m.append.mockReset().mockResolvedValue({ ok: true });
  m.send.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("LANDING_ADMIN_EMAIL", "team@pz.test");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PRE_EB);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("registration flow", () => {
  it("config -> quote -> register -> outbox -> status -> double submit -> login link", async () => {
    // 1. The widget loads the page's public config.
    const cfgRes = await config(new Request("http://x", { headers: { "x-vercel-ip-country": "PK" } }) as never, ctx);
    const cfg = await cfgRes.json();
    expect(cfg).toMatchObject({ pageId: "page-1", status: "published", country: "PK" });
    expect(cfg.registration.earlyBirdActive).toBe(true);
    expect(cfg.accounts.map((a: { key: string }) => a.key)).toEqual(["faysal", "easypaisa", "mashreq", "paypal"]);

    // 2. Live price with a promo code.
    const q = await (await quote(json({
      regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, promoCode: "pz10", email: "ayesha@example.com",
    }), ctx)).json();
    expect(q.quote).toMatchObject({ ok: true, total: 4800 });
    expect(q.promo).toMatchObject({ ok: true, total: 4320 });

    // 3. Submit.
    const res = await register(form(ppcPayload({ promoCode: "PZ10" })), ctx);
    expect(res.status).toBe(201);
    const reg = await res.json();
    expect(reg).toMatchObject({ refId: "PZA-PPC-001", total: 4320, currency: "PKR" });
    expect(reg.verifyMessage).toContain("Ref: PZA-PPC-001");
    expect(reg.waGroups.length).toBeGreaterThan(0);
    expect(store.landing_promo_codes[0].used_count).toBe(1);
    const lead = store.landing_registrations[0];
    expect(lead).toMatchObject({
      ref_id: "PZA-PPC-001", email: "ayesha@example.com", expected_amount: 4320, status: "pending",
      voucher_url: "https://drive.google.com/file/d/v1/view", promo_code_id: "promo-1", is_test: false,
    });

    // 4. The outbox was written before the reply and runs in the background.
    expect(store.landing_jobs.map((j) => j.type)).toEqual(["sheet_append", "email_received", "email_admin"]);
    await settle();
    expect(store.landing_jobs.map((j) => j.status)).toEqual(["done", "done", "done"]);
    expect(m.append).toHaveBeenCalledTimes(1);
    const [sheetId, rows] = m.append.mock.calls[0] as [string, string[][]];
    expect(sheetId).toBe("sheet-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("PZA-PPC-001");
    expect(m.send.mock.calls.map((c) => (c[0] as { to: string }).to).sort()).toEqual(["ayesha@example.com", "team@pz.test"]);
    expect(lead.email_status).toBe("received_sent");

    // 5. Status lookup by ref + email.
    const st = await status(new Request("http://x/api/landing/ppc-b4/status?ref=pza-ppc-001&email=Ayesha%40Example.com") as never, ctx);
    expect(await st.json()).toEqual({ status: "pending", name: "Ayesha Khan", eventLabel: "PPC Batch 3" });

    // 6. A double submit gets the same reference and creates nothing.
    const again = await register(form(ppcPayload({ promoCode: "PZ10" })), ctx);
    expect(again.status).toBe(201);
    expect((await again.json()).refId).toBe("PZA-PPC-001");
    expect(rpcCalls).toBe(1);
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(store.landing_promo_codes[0].used_count).toBe(1);

    // 7. The guest signs in later: the registration becomes theirs.
    expect(await linkRegistrationsToStudent("user-9", "Ayesha@Example.com")).toBe(1);
    expect(store.landing_registrations[0].student_id).toBe("user-9");
    expect(await linkRegistrationsToStudent("user-9", "ayesha@example.com")).toBe(0);
  });

  it("test mode: TEST ref, no promo use, no Sheet row, every email to the admin with [TEST]", async () => {
    m.admin = { ok: true, user: { id: "admin-1", email: "admin@pz.test" } };
    db.state.users["admin-1"] = { email: "admin@pz.test" };
    const res = await register(form(ppcPayload({ testMode: true, promoCode: "PZ10" })), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).refId).toBe("TEST-12345");
    expect(store.landing_registrations[0]).toMatchObject({ is_test: true, student_id: "admin-1", ref_id: "TEST-12345", promo_code_id: null });
    expect(store.landing_promo_codes[0].used_count).toBe(0);
    expect(store.landing_jobs.map((j) => j.type)).toEqual(["email_received", "email_admin"]);
    await settle();
    expect(m.append).not.toHaveBeenCalled();
    const sent = m.send.mock.calls.map((c) => c[0] as { to: string; subject: string });
    expect(sent.map((s) => s.to)).toEqual(["admin@pz.test", "admin@pz.test"]);
    expect(sent.every((s) => s.subject.startsWith("[TEST]"))).toBe(true);
    // A test row is never linked to a student account.
    expect(await linkRegistrationsToStudent("user-9", "ayesha@example.com")).toBe(0);
  });

  it("a visitor cannot switch on test mode", async () => {
    const res = await register(form(ppcPayload({ testMode: true })), ctx);
    expect(res.status).toBe(403);
    expect(store.landing_registrations).toHaveLength(0);
    expect(store.landing_jobs).toHaveLength(0);
  });
});
