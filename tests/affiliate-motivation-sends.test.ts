import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown, area: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.area = area;
    return gate.result;
  },
}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { recordMotivationSend, listMotivationSends, getMotivationSendHtml } from "@/lib/data/affiliate-motivation-sends";
import { GET } from "@/app/api/admin/affiliates/motivation-sends/[id]/route";

const T = "affiliate_motivation_sends";
let store: Store;
const use = (s: Store) => {
  store = s;
  db.state.handler = memoryHandler(store);
};

beforeEach(() => {
  db.reset();
  gate.result = { ok: true, user: { id: "u" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordMotivationSend", () => {
  it("inserts on the first call, then adds counts and appends names for the same id", async () => {
    use({ [T]: [] });
    expect(await recordMotivationSend({ id: "s1", subject: "Sub", html: "<p>x</p>", sent: [{ name: "A" }, { name: "B" }], failed: [{ name: "C" }] })).toBe(true);
    expect(await recordMotivationSend({ id: "s1", subject: "Other", html: "<p>y</p>", sent: [{ name: "D" }], failed: [] })).toBe(true);
    expect(store[T]).toHaveLength(1);
    expect(store[T][0]).toMatchObject({
      id: "s1",
      subject: "Sub",
      html: "<p>x</p>",
      recipient_count: 3,
      failed_count: 1,
      recipients: [
        { name: "A", ok: true },
        { name: "B", ok: true },
        { name: "C", ok: false },
        { name: "D", ok: true },
      ],
    });
  });

  it("never throws and returns false when saving fails", async () => {
    use({ [T]: [] });
    db.state.handler = () => {
      throw new Error("db down");
    };
    expect(await recordMotivationSend({ id: "s1", subject: "S", html: "h", sent: [{ name: "A" }], failed: [] })).toBe(false);
    db.state.handler = () => ({ data: null, error: { message: "nope" } });
    expect(await recordMotivationSend({ id: "s1", subject: "S", html: "h", sent: [{ name: "A" }], failed: [] })).toBe(false);
  });
});

describe("listMotivationSends and getMotivationSendHtml", () => {
  it("lists newest first without html, and loads html by id", async () => {
    use({
      [T]: [
        { id: "a", created_at: "2026-11-01T00:00:00Z", subject: "Old", html: "<p>old</p>", recipient_count: 1, failed_count: 0, recipients: [{ name: "A", ok: true }] },
        { id: "b", created_at: "2026-11-05T00:00:00Z", subject: "New", html: "<p>new</p>", recipient_count: 2, failed_count: 1, recipients: [] },
      ],
    });
    const list = await listMotivationSends();
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list[1]).toEqual({ id: "a", createdAt: "2026-11-01T00:00:00Z", subject: "Old", recipientCount: 1, failedCount: 0, recipients: [{ name: "A", ok: true }] });
    expect(JSON.stringify(list)).not.toContain("<p>");
    expect(await getMotivationSendHtml("b")).toBe("<p>new</p>");
    expect(await getMotivationSendHtml("zzz")).toBeNull();
  });
});

describe("GET /api/admin/affiliates/motivation-sends/[id]", () => {
  const call = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) });

  it("is admin only", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    use({ [T]: [] });
    expect((await call("a")).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect(db.state.ops).toHaveLength(0);
  });

  it("returns the html, 404 for an unknown id, and a calm 500 on a database error", async () => {
    use({ [T]: [{ id: "a", subject: "S", html: "<p>hi</p>" }] });
    const ok = await call("a");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ html: "<p>hi</p>" });
    const missing = await call("nope");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Not found." });
    db.state.handler = () => ({ data: null, error: { message: "secret db detail" } });
    const bad = await call("a");
    expect(bad.status).toBe(500);
    expect(JSON.stringify(await bad.json())).not.toContain("secret");
  });
});
