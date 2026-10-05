import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const UNSUB = "2026-10-01T10:00:00.000Z";
const CONTACT = {
  id: "c1", full_name: "Zed", phone_e164: "+923001111111", email: "z@x.com", profession: "Pharmacist", owner_id: "hina",
  last_outcome: null, next_followup_at: null, do_not_contact_at: null, whatsapp_unsubscribed_at: UNSUB,
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const result =
        table === "contacts" ? { data: CONTACT, error: null }
        : table === "contact_activities" ? { data: [], error: null }
        : { data: [{ id: "hina", full_name: "Hina" }], error: null };
      const chain: unknown = new Proxy({}, {
        get: (_t, prop) => (prop === "then" ? (res: (v: unknown) => unknown) => res(result) : () => chain),
      });
      return chain;
    },
  }),
}));

import { getContactDetail } from "@/lib/data/sales-contacts";

describe("getContactDetail unsubscribed flag", () => {
  it("is withheld from a non-owner agent", async () => {
    const res = await getContactDetail({ id: "me", role: "sales_agent" }, "c1");
    if (!res.ok) throw new Error("failed");
    expect(res.restricted).toBe(true);
    expect(res.contact.whatsapp_unsubscribed_at).toBeNull();
  });
  it("is shown to the owner", async () => {
    const res = await getContactDetail({ id: "hina", role: "sales_agent" }, "c1");
    if (!res.ok) throw new Error("failed");
    expect(res.contact.whatsapp_unsubscribed_at).toBe(UNSUB);
  });
  it("is shown to an admin", async () => {
    const res = await getContactDetail({ id: "adm", role: "admin" }, "c1");
    if (!res.ok) throw new Error("failed");
    expect(res.contact.whatsapp_unsubscribed_at).toBe(UNSUB);
  });
});
