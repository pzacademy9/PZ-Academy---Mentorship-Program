import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock } from "./helpers/supabase-mock";

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

import { POST } from "@/app/api/admin/affiliates/board-link/route";
import { isBoardToken } from "@/lib/data/affiliate-leaderboard";

const OLD = "O".repeat(32);

beforeEach(() => {
  db.reset();
  gate.result = { ok: true, user: { id: "u" } };
  let stored = OLD;
  db.state.handler = (op) => {
    if (op.table !== "affiliate_board_link") return { data: null, error: null };
    if (op.op === "upsert") {
      stored = (op.payload as { token: string }).token;
      return { data: null, error: null };
    }
    return { data: { token: stored }, error: null };
  };
});

const post = () => POST();

describe("POST /api/admin/affiliates/board-link", () => {
  it("is for the sales_hub area and refuses others without touching data", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await post()).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect(db.state.ops).toHaveLength(0);
  });

  it("rotates: returns the new public url and the old token stops working", async () => {
    expect(await isBoardToken(OLD)).toBe(true);
    const res = await post();
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https?:\/\/[^/]+\/affiliate-board\/[A-Za-z0-9_-]{20,64}$/);
    const token = url.split("/").pop()!;
    expect(token).not.toBe(OLD);
    expect(await isBoardToken(OLD)).toBe(false);
    expect(await isBoardToken(token)).toBe(true);
  });

  it("a failure gives a generic 500 without details", async () => {
    db.state.handler = () => ({ data: null, error: { message: "secret db detail" } });
    const res = await post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
