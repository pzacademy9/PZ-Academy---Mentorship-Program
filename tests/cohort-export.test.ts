import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("server-only", () => ({}));

import { loadCohortAudience } from "@/lib/data/cohort-export";
import { listCohorts, getCohortDetail } from "@/lib/data/admin-crm-import";

const pad = (i: number) => String(i).padStart(5, "0");
const contact = (id: string, o: Record<string, unknown> = {}) => ({
  id, email: `${id}@x.com`, phone_e164: null, full_name: `Name ${id}`, country: "PK",
  email_unsubscribed_at: null, whatsapp_unsubscribed_at: null, do_not_contact_at: null, ...o,
});
const batch = (id: string, kind: string, o: Record<string, unknown> = {}) => ({
  id, sheet_name: `Sheet ${id}`, tab_name: "tab", rows_imported: 0, created_at: "2026-01-01T00:00:00Z",
  course_id: null, courses: null, kind, ...o,
});

let store: Store;
function setup(s: Partial<Store>) {
  store = { import_batches: [], contact_purchases: [], import_batch_contacts: [], contacts: [], email_metrics: [], ...s };
  db.state.handler = memoryHandler(store);
}
beforeEach(() => db.reset());

describe("loadCohortAudience", () => {
  it("exports all 1300 contacts of a cohort with 1300 purchase rows", async () => {
    const ids = Array.from({ length: 1300 }, (_, i) => `c${pad(i)}`);
    setup({
      import_batches: [batch("b1", "imported")],
      contacts: ids.map((id) => contact(id)),
      contact_purchases: ids.map((id, i) => ({ id: `p${pad(i)}`, contact_id: id, import_batch_id: "b1" })),
    });
    const { contacts, names } = await loadCohortAudience(["b1"]);
    expect(contacts).toHaveLength(1300);
    expect(new Set(contacts.map((c) => c.id)).size).toBe(1300);
    expect(names).toHaveLength(1);
    for (const op of db.state.ops.filter((o) => o.op === "select")) {
      for (const [k, , v] of op.filters) if (k === "in") expect((v as unknown[]).length).toBeLessThanOrEqual(200);
    }
  });

  it("interested cohort exports members minus anyone with a purchase", async () => {
    setup({
      import_batches: [batch("bi", "closed_interested")],
      contacts: [contact("a"), contact("b"), contact("c")],
      import_batch_contacts: [
        { import_batch_id: "bi", contact_id: "a" },
        { import_batch_id: "bi", contact_id: "b" },
        { import_batch_id: "bi", contact_id: "c" },
      ],
      contact_purchases: [{ id: "p1", contact_id: "b", import_batch_id: null }],
    });
    const { contacts } = await loadCohortAudience(["bi"]);
    expect(contacts.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("a contact in two selected cohorts appears once", async () => {
    setup({
      import_batches: [batch("b1", "imported"), batch("b2", "closed_paid")],
      contacts: [contact("a"), contact("b")],
      contact_purchases: [
        { id: "p1", contact_id: "a", import_batch_id: "b1" },
        { id: "p2", contact_id: "a", import_batch_id: "b2" },
        { id: "p3", contact_id: "b", import_batch_id: "b2" },
      ],
    });
    const { contacts, names } = await loadCohortAudience(["b1", "b2"]);
    expect(contacts.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(names).toHaveLength(2);
  });

  it("maps fields and flags suppressed emails case-insensitively", async () => {
    setup({
      import_batches: [batch("b1", "imported")],
      contacts: [contact("a", { email: "a@x.com", phone_e164: "+923001", do_not_contact_at: "2026-02-01" }), contact("b")],
      contact_purchases: [
        { id: "p1", contact_id: "a", import_batch_id: "b1" },
        { id: "p2", contact_id: "b", import_batch_id: "b1" },
      ],
      email_metrics: [
        { user_email: "A@x.com", event_type: "hard_bounce" },
        { user_email: "b@x.com", event_type: "open" },
      ],
    });
    const { contacts } = await loadCohortAudience(["b1"]);
    const a = contacts.find((c) => c.id === "a")!;
    const b = contacts.find((c) => c.id === "b")!;
    expect(a).toMatchObject({ phoneE164: "+923001", fullName: "Name a", country: "PK", doNotContactAt: "2026-02-01" });
    expect(a.emailSuppressed).toBe(true);
    expect(b.emailSuppressed).toBe(false);
  });

  it("returns no names when none of the ids exist", async () => {
    setup({});
    expect(await loadCohortAudience(["nope"])).toEqual({ contacts: [], names: [] });
  });
});

describe("listCohorts", () => {
  it("returns kind and contactCount, paging past 1000 purchases", async () => {
    setup({
      import_batches: [batch("b1", "imported"), batch("bi", "closed_interested")],
      contact_purchases: Array.from({ length: 1300 }, (_, i) => ({ id: `p${pad(i)}`, contact_id: `c${i}`, import_batch_id: "b1" })),
      import_batch_contacts: [
        { import_batch_id: "bi", contact_id: "x" },
        { import_batch_id: "bi", contact_id: "y" },
      ],
    });
    const rows = await listCohorts();
    const b1 = rows.find((r) => r.id === "b1")!;
    const bi = rows.find((r) => r.id === "bi")!;
    expect(b1).toMatchObject({ kind: "imported", purchaseCount: 1300, contactCount: 1300 });
    expect(bi).toMatchObject({ kind: "closed_interested", purchaseCount: 0, contactCount: 2 });
  });
});

describe("getCohortDetail", () => {
  it("lists an interested cohort's contacts from import_batch_contacts", async () => {
    setup({
      import_batches: [batch("bi", "closed_interested")],
      contacts: [contact("a")],
      import_batch_contacts: [{ import_batch_id: "bi", contact_id: "a" }],
    });
    const d = await getCohortDetail("bi");
    expect(d?.kind).toBe("closed_interested");
    expect(d?.contactCount).toBe(1);
    expect(d?.contacts.map((c) => c.contactId)).toEqual(["a"]);
  });
});
