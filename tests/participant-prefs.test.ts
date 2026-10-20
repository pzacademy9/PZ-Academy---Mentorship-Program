import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("server-only", () => ({}));

import { getOrCreateToken, listUnsubscribed, unsubscribeParticipantByToken } from "@/lib/data/participant-prefs";

/** Upsert with ignoreDuplicates keeps the existing row and assigns a token like the column default. */
function prefsHandler(store: Record<string, Record<string, unknown>[]>) {
  const inner = memoryHandler(store);
  let n = 0;
  return (op: Op): Res => {
    if (op.op === "upsert") {
      const p = op.payload as { email: string };
      const rows = (store[op.table] ??= []);
      if (!rows.some((r) => r.email === p.email)) rows.push({ email: p.email, token: `tok-${++n}`, unsubscribed_at: null });
      return { data: null, error: null };
    }
    return inner(op);
  };
}

beforeEach(() => db.reset());

describe("getOrCreateToken", () => {
  it("upserts the lowercase email and returns the stored token, stable on repeat", async () => {
    db.state.handler = prefsHandler({});
    const t1 = await getOrCreateToken("A@B.com");
    const t2 = await getOrCreateToken("a@b.com");
    expect(t1).toBe("tok-1");
    expect(t2).toBe(t1);
    expect(db.find("participant_email_prefs", "upsert")[0].payload).toEqual({ email: "a@b.com" });
  });
});

describe("unsubscribeParticipantByToken", () => {
  it("returns ok then already, and not-found for an unknown token", async () => {
    db.state.handler = prefsHandler({ participant_email_prefs: [{ email: "a@b.com", token: "t1", unsubscribed_at: null }] });
    expect(await unsubscribeParticipantByToken("t1")).toBe("ok");
    expect(await unsubscribeParticipantByToken("t1")).toBe("already");
    expect(await unsubscribeParticipantByToken("nope")).toBe("not-found");
  });
  it("returns error, not not-found, when the database fails", async () => {
    db.state.handler = () => ({ data: null, error: { message: "down" } });
    expect(await unsubscribeParticipantByToken("t1")).toBe("error");
  });
  it("returns error when the update fails", async () => {
    const inner = prefsHandler({ participant_email_prefs: [{ email: "a@b.com", token: "t1", unsubscribed_at: null }] });
    db.state.handler = (op) => (op.op === "update" ? { data: null, error: { message: "down" } } : inner(op));
    expect(await unsubscribeParticipantByToken("t1")).toBe("error");
  });
});

describe("listUnsubscribed", () => {
  it("returns lowercase emails that have unsubscribed", async () => {
    db.state.handler = prefsHandler({
      participant_email_prefs: [
        { email: "a@b.com", token: "t1", unsubscribed_at: "2026-01-01" },
        { email: "c@d.com", token: "t2", unsubscribed_at: null },
      ],
    });
    const set = await listUnsubscribed(["A@B.com", "c@d.com", "e@f.com"]);
    expect(Array.from(set)).toEqual(["a@b.com"]);
  });
  it("returns an empty set for no input without querying", async () => {
    expect((await listUnsubscribed([])).size).toBe(0);
    expect(db.state.ops.length).toBe(0);
  });
});
