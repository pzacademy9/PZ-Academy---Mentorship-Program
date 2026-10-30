// tests/class-audience-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getSessionAudience, setSessionAudience, type SessionRow } from "@/lib/data/attendance";

const row = (audience: unknown) => ({ id: "s1", audience }) as unknown as SessionRow;

beforeEach(() => {
  db.state.ops.length = 0;
  db.state.handler = () => ({ data: null, error: null });
});

describe("getSessionAudience", () => {
  it("returns a valid stored audience", () => {
    expect(getSessionAudience(row({ mode: "live", modules: [1] }))).toEqual({ mode: "live", modules: [1] });
  });
  it("returns null for null or malformed audience", () => {
    expect(getSessionAudience(row(null))).toBeNull();
    expect(getSessionAudience(row({ bad: 1 }))).toBeNull();
  });
});

describe("setSessionAudience", () => {
  it("updates only the audience column", async () => {
    await setSessionAudience("s1", { mode: "any", modules: "all" });
    const op = db.state.ops[0];
    expect(op.table).toBe("batch_sessions");
    expect(op.op).toBe("update");
    expect(op.payload).toEqual({ audience: { mode: "any", modules: "all" } });
    expect(op.filters).toEqual([["eq", "id", "s1"]]);
  });
  it("clears the audience with null", async () => {
    await setSessionAudience("s1", null);
    expect(db.state.ops[0].payload).toEqual({ audience: null });
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(setSessionAudience("s1", null)).rejects.toThrow(/boom/);
  });
});
