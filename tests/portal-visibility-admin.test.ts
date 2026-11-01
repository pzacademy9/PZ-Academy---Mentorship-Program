// tests/portal-visibility-admin.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/data/landing-payment-countries", () => ({ resolveRegionAccountKeys: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";
const mock = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => mock.client }));

import { setPortalVisibility } from "@/lib/data/landing-pages";
import { POST as portalRoute } from "@/app/api/admin/landing-pages/[id]/portal/route";

const ID = "00000000-0000-4000-8000-000000000001";
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never;
const ctx = { params: Promise.resolve({ id: ID }) };

let store: Store;
function setup(rows: Record<string, unknown>[]) {
  store = { landing_pages: rows };
  mock.state.handler = memoryHandler(store);
}

beforeEach(() => {
  mock.reset();
  revalidatePath.mockReset();
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-user" } });
});

describe("setPortalVisibility", () => {
  it("writes the flag and revalidates the admin list and the portal", async () => {
    setup([{ id: ID, slug: "ppc", show_in_portal: true }]);
    expect(await setPortalVisibility(ID, false)).toEqual({ ok: true });
    expect(store.landing_pages[0].show_in_portal).toBe(false);
    expect(await setPortalVisibility(ID, true)).toEqual({ ok: true });
    expect(store.landing_pages[0].show_in_portal).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/admin/landing-pages");
    expect(revalidatePath).toHaveBeenCalledWith("/progress", "layout");
  });
  it("is not-found for an unknown page", async () => {
    setup([]);
    expect(await setPortalVisibility(ID, false)).toEqual({ ok: false, reason: "not-found" });
  });
  it("is db-error when the write fails", async () => {
    mock.state.handler = () => ({ data: null, error: { message: "down" } });
    expect(await setPortalVisibility(ID, false)).toEqual({ ok: false, reason: "db-error" });
  });
});

describe("POST /api/admin/landing-pages/[id]/portal", () => {
  it("rejects a non-admin before touching the database", async () => {
    setup([{ id: ID, slug: "ppc", show_in_portal: true }]);
    requireAdmin.mockResolvedValue({ ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const res = await portalRoute(req({ show: false }), ctx);
    expect(res.status).toBe(403);
    expect(store.landing_pages[0].show_in_portal).toBe(true);
  });
  it("404 on a bad uuid, 400 on a bad body", async () => {
    setup([{ id: ID, slug: "ppc", show_in_portal: true }]);
    expect((await portalRoute(req({ show: false }), { params: Promise.resolve({ id: "nope" }) })).status).toBe(404);
    expect((await portalRoute(req({ show: "no" }), ctx)).status).toBe(400);
    expect((await portalRoute(req({}), ctx)).status).toBe(400);
  });
  it("saves and answers ok, 404 for a missing page, 500 on a failure", async () => {
    setup([{ id: ID, slug: "ppc", show_in_portal: true }]);
    const res = await portalRoute(req({ show: false }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, show: false });
    expect(store.landing_pages[0].show_in_portal).toBe(false);
    setup([]);
    expect((await portalRoute(req({ show: false }), ctx)).status).toBe(404);
    mock.state.handler = () => ({ data: null, error: { message: "down" } });
    expect((await portalRoute(req({ show: false }), ctx)).status).toBe(500);
  });
});
