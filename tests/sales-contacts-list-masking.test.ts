import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROWS = [
  { id: "own", owner_id: "me", phone_e164: "+923001111111", full_name: "Own", last_outcome: "interested", next_followup_at: "2026-10-06T10:00:00.000Z", do_not_contact_at: "2026-10-01T10:00:00.000Z" },
  { id: "other", owner_id: "hina", phone_e164: "+923002222222", full_name: "Other", last_outcome: "interested", next_followup_at: "2026-10-06T10:00:00.000Z", do_not_contact_at: "2026-10-01T10:00:00.000Z" },
  { id: "free", owner_id: null, phone_e164: "+923003333333", full_name: "Free", last_outcome: null, next_followup_at: "2026-10-06T10:00:00.000Z", do_not_contact_at: null },
];

// A chainable stand-in for the Supabase query builder: every method returns the builder, awaiting it resolves.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const result =
        table === "contacts"
          ? { data: ROWS, count: ROWS.length, error: null }
          : { data: [{ id: "hina", full_name: "Hina" }], error: null };
      const b: Record<string, unknown> = {};
      const chain = new Proxy(b, {
        get: (_t, prop) => (prop === "then" ? (res: (v: unknown) => unknown) => res(result) : () => chain),
      });
      return chain;
    },
  }),
}));

import { listContacts } from "@/lib/data/sales-contacts";

const run = async (actor: { id: string; role: "sales_agent" | "admin" }) => {
  const res = await listContacts(actor, { tab: "all", page: 1 });
  if (!res.ok) throw new Error("listContacts failed");
  return Object.fromEntries(res.rows.map((r) => [r.id, r]));
};

describe("listContacts masking", () => {
  it("hides phone, follow-up time and do-not-contact on another agent's contact", async () => {
    const rows = await run({ id: "me", role: "sales_agent" });
    expect(rows.other.phone_e164).toBeNull();
    expect(rows.other.next_followup_at).toBeNull();
    expect(rows.other.do_not_contact_at).toBeNull();
    expect(rows.other.owner_name).toBe("Hina");
  });

  it("leaves own and unclaimed contacts unchanged", async () => {
    const rows = await run({ id: "me", role: "sales_agent" });
    expect(rows.own.next_followup_at).toBe("2026-10-06T10:00:00.000Z");
    expect(rows.own.do_not_contact_at).toBe("2026-10-01T10:00:00.000Z");
    expect(rows.own.phone_e164).toBe("+923001111111");
    expect(rows.free.next_followup_at).toBe("2026-10-06T10:00:00.000Z");
    expect(rows.free.phone_e164).toBe("+923003333333");
  });

  it("admins see everything", async () => {
    const rows = await run({ id: "boss", role: "admin" });
    expect(rows.other.next_followup_at).toBe("2026-10-06T10:00:00.000Z");
    expect(rows.other.do_not_contact_at).toBe("2026-10-01T10:00:00.000Z");
    expect(rows.other.phone_e164).toBe("+923002222222");
  });
});
