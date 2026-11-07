import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const created = vi.hoisted(() => [] as { url: string; key: string; opts: { global?: { fetch?: typeof fetch } } }[]);
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts: { global?: { fetch?: typeof fetch } }) => {
    created.push({ url, key, opts });
    return {};
  },
}));

describe("createAdminSupabase noStore option", () => {
  beforeEach(() => {
    created.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  });

  it("default client adds no custom fetch (landing pages keep their cache)", async () => {
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    createAdminSupabase();
    expect(created[0].opts.global).toBeUndefined();
  });

  it("noStore client asks fetch for a fresh answer every time", async () => {
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    createAdminSupabase({ noStore: true });
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => { seen.push(init ?? {}); return new Response("{}"); }));
    await created[0].opts.global!.fetch!("https://x.supabase.co/rest/v1/site_terms", { method: "GET" });
    expect(seen[0].cache).toBe("no-store");
  });
});
