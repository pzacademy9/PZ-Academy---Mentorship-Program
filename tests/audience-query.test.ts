import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("server-only", () => ({}));

import {
  resolveAudienceContactIds,
  countAudience,
  loadAudienceFile,
  audienceFacets,
  courseNameOf,
  modeFromLabel,
} from "@/lib/data/audience-query";
import { loadAudienceContacts, loadCohortAudience, mapPool } from "@/lib/data/cohort-export";
import { DEFAULT_AUDIENCE_FILTER, type AudienceFilter } from "@/lib/crm/audience-filter";

const contact = (id: string, o: Record<string, unknown> = {}) => ({
  id, email: `${id}@x.com`, phone_e164: null, full_name: `Name ${id}`, country: "PK",
  email_unsubscribed_at: null, whatsapp_unsubscribed_at: null, do_not_contact_at: null, ...o,
});
const purchase = (id: string, contactId: string, o: Record<string, unknown> = {}) => ({
  id, contact_id: contactId, import_batch_id: null, product_label: "", course_id: null,
  reg_mode: null, purchased_at: null, created_at: "2026-01-01T00:00:00+00:00", ...o,
});
const batch = (id: string, kind: string, o: Record<string, unknown> = {}) => ({
  id, sheet_id: `sheet-${id}`, sheet_name: `Sheet ${id}`, tab_name: "tab", course_id: null, kind, ...o,
});
const interested = (batchId: string, contactId: string, o: Record<string, unknown> = {}) => ({
  import_batch_id: batchId, contact_id: contactId, reg_mode: null, option_keys: [], region: null, registered_at: null, ...o,
});

const COURSES = [
  { id: "k-pharm", title: "Pharmacology Basics" },
  { id: "k-clin", title: "Clinical Course" },
  { id: "k-other", title: "Other Course" },
];

let store: Store;
function setup(s: Partial<Store>, wrap?: (op: Op, inner: (op: Op) => Res) => Res) {
  store = {
    courses: COURSES, import_batches: [], contact_purchases: [], import_batch_contacts: [], contacts: [],
    email_metrics: [], landing_pages: [], landing_registrations: [], ...s,
  };
  const inner = memoryHandler(store);
  db.state.handler = (op) => {
    if (wrap) return wrap(op, inner);
    const res = inner(op);
    // Like PostgREST: an unranged select returns at most 1000 rows.
    if (op.op === "select" && !op.range && !op.single && !op.head && Array.isArray(res.data) && res.data.length > 1000) {
      return { ...res, data: res.data.slice(0, 1000) };
    }
    return res;
  };
}
beforeEach(() => db.reset());

const F = (o: Partial<AudienceFilter> = {}): AudienceFilter => ({ ...DEFAULT_AUDIENCE_FILTER, ...o });
const ids = async (o: Partial<AudienceFilter> = {}) => (await resolveAudienceContactIds(F(o))).ids;

describe("courseNameOf", () => {
  it("uses the course title, else the label's course part, else Unnamed; interested falls back to the sheet name", () => {
    expect(courseNameOf({ kind: "purchase", courseTitle: "Pharmacology Basics", productLabel: "x" })).toBe("Pharmacology Basics");
    expect(courseNameOf({ kind: "purchase", courseTitle: null, productLabel: "Clinical Course — Individual — PKR 1,000" })).toBe("Clinical Course");
    expect(courseNameOf({ kind: "purchase", courseTitle: null, productLabel: "Individual — PKR 2,700" })).toBe("Unnamed");
    expect(courseNameOf({ kind: "interested", courseTitle: null, sheetName: "Clinical Course (interested)" })).toBe("Clinical Course");
    expect(courseNameOf({ kind: "interested", courseTitle: " Other Course ", sheetName: "Page (interested)" })).toBe("Other Course");
  });
});

describe("course names from the import batch", () => {
  it("purchases with no course and no course in the label are named after their batch's course, then its sheet", async () => {
    setup({
      import_batches: [
        batch("b1", "imported", { course_id: "k-pharm", sheet_name: "Old Sheet One" }),
        batch("b2", "imported", { sheet_name: "  PPC Batch 3 " }),
        batch("b3", "imported", { sheet_name: "" }),
      ],
      contacts: [contact("a"), contact("b"), contact("c")],
      contact_purchases: [
        purchase("p1", "a", { import_batch_id: "b1", product_label: "Individual — PKR 2,700" }),
        purchase("p2", "b", { import_batch_id: "b2", product_label: "Individual — PKR 2,700" }),
        purchase("p3", "c", { import_batch_id: "b3", product_label: "Individual — PKR 2,700" }),
      ],
    });
    const f = await audienceFacets();
    expect(f.courses).toEqual([
      { name: "Pharmacology Basics", count: 1 },
      { name: "PPC Batch 3", count: 1 },
      { name: "Unnamed", count: 1 },
    ]);
    expect(await ids({ courses: ["PPC Batch 3"] })).toEqual(["b"]);
    expect(await ids({ courses: ["Pharmacology Basics"] })).toEqual(["a"]);
  });

  it("courseNameOf uses batch course, then batch sheet name (without a (paid) suffix)", () => {
    expect(courseNameOf({ kind: "purchase", courseTitle: null, productLabel: "Individual — PKR 1", batchCourseTitle: "Batch Course", batchSheetName: "S" })).toBe("Batch Course");
    expect(courseNameOf({ kind: "purchase", courseTitle: null, productLabel: "Individual — PKR 1", batchCourseTitle: null, batchSheetName: "Page X (paid)" })).toBe("Page X");
    expect(courseNameOf({ kind: "purchase", courseTitle: null, productLabel: "Clinical Course — Individual", batchCourseTitle: "Batch Course", batchSheetName: "S" })).toBe("Clinical Course");
  });

  it("a landing page with no linked course gives its paid and interested people one course name", async () => {
    setup({
      import_batches: [
        batch("bp", "closed_paid", { sheet_id: "landing:page-pv", sheet_name: "PV Batch 3 [Weekend] (paid)" }),
        batch("bi", "closed_interested", { sheet_id: "landing:page-pv", sheet_name: " PV Batch 3 [Weekend] (interested)" }),
      ],
      contacts: [contact("a"), contact("b")],
      contact_purchases: [
        purchase("p1", "a", { import_batch_id: "bp", product_label: "PV Batch 3 [Weekend] — Individual — PKR 2,700" }),
      ],
      import_batch_contacts: [interested("bi", "b")],
    });
    const f = await audienceFacets();
    expect(f.courses).toEqual([{ name: "PV Batch 3 [Weekend]", count: 2 }]);
    expect(await ids({ courses: ["PV Batch 3 [Weekend]"] })).toEqual(["a", "b"]);
    expect(
      courseNameOf({
        kind: "purchase", courseTitle: null, productLabel: "PV Batch 3 [Weekend] — Individual",
        batchCourseTitle: null, batchSheetName: "PV Batch 3 [Weekend] (paid)", batchIsLanding: true,
      }),
    ).toBe("PV Batch 3 [Weekend]");
    // An imported (non-landing) sheet keeps the label rule.
    expect(
      courseNameOf({
        kind: "purchase", courseTitle: null, productLabel: "PV Batch 3 [Weekend] — Individual",
        batchCourseTitle: null, batchSheetName: "Old sheet", batchIsLanding: false,
      }),
    ).toBe("PV Batch 3");
  });
});

describe("mapPool", () => {
  it("keeps result order with several running at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool(Array.from({ length: 12 }, (_, i) => i), 5, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, (12 - n) * 2));
      running--;
      return n * 10;
    });
    expect(out).toEqual(Array.from({ length: 12 }, (_, i) => i * 10));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("rejects with the first failure", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("contacts read failed");
        return n;
      }),
    ).rejects.toThrow("contacts read failed");
  });
});

describe("modeFromLabel", () => {
  it("finds exactly one of the words Live or Recorded, as whole words", () => {
    expect(modeFromLabel("Clinical Course � Live � PKR 1,000")).toBe("live");
    expect(modeFromLabel("Recorded � Individual")).toBe("recorded");
    expect(modeFromLabel("LIVE class")).toBe("live");
    expect(modeFromLabel("Live and Recorded")).toBeNull();
    expect(modeFromLabel("Individual � PKR 2,700")).toBeNull();
    expect(modeFromLabel("Free delivery, stay alive, liver")).toBeNull();
    expect(modeFromLabel(null)).toBeNull();
  });
});

describe("status of a registration", () => {
  const withStatus = () =>
    setup({
      import_batches: [batch("bi", "closed_interested", { sheet_name: "Clinical Course (interested)" })],
      contacts: ["a", "r", "p", "u", "f", "n", "x", "z"].map((i) => contact(i)),
      contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" })],
      import_batch_contacts: [
        interested("bi", "a", { reg_status: "reserved" }),
        interested("bi", "r", { reg_status: "reserved" }),
        interested("bi", "p", { reg_status: "pending" }),
        interested("bi", "u", { reg_status: "underpaid" }),
        interested("bi", "f", { reg_status: "free" }),
        interested("bi", "n", { reg_status: null }),
        interested("bi", "x", { reg_status: "  " }),
        interested("bi", "z", { reg_status: "weird" }),
      ],
    });

  it("purchases are paid; interested rows use reg_status; underpaid is part-paid; blank or unknown is pending", async () => {
    withStatus();
    expect(await ids({ statuses: ["paid"] })).toEqual(["a"]);
    expect(await ids({ statuses: ["reserved"] })).toEqual(["r"]);
    expect(await ids({ statuses: ["pending"] })).toEqual(["n", "p", "x", "z"]);
    expect(await ids({ statuses: ["part_paid"] })).toEqual(["u"]);
    expect(await ids({ statuses: ["free"] })).toEqual(["f"]);
    expect(await ids({ statuses: ["reserved", "free"] })).toEqual(["f", "r"]);
    expect((await ids({ statuses: [] })).length).toBe(8);
  });

  it("status, course and date must hold on one registration", async () => {
    setup({
      import_batches: [batch("bi", "closed_interested", { sheet_name: "Clinical Course (interested)" })],
      contacts: [contact("a")],
      import_batch_contacts: [interested("bi", "a", { reg_status: "reserved", registered_at: "2026-01-02T00:00:00+00:00" })],
    });
    expect(await ids({ statuses: ["reserved"], from: "2026-01-01" })).toEqual(["a"]);
    expect(await ids({ statuses: ["reserved"], from: "2026-02-01" })).toEqual([]);
    expect(await ids({ statuses: ["pending"], from: "2026-01-01" })).toEqual([]);
  });

  it("before 0117 (no reg_status column) it retries without it, every interested row is pending, and flags statusNeedsUpdate", async () => {
    setup(
      {
        import_batches: [batch("bi", "closed_interested")],
        contacts: [contact("a"), contact("b")],
        import_batch_contacts: [interested("bi", "a"), interested("bi", "b")],
      },
      (op, inner) => {
        if (op.table === "import_batch_contacts" && op.columns?.includes("reg_status")) {
          return { data: null, error: { code: "42703", message: "column import_batch_contacts.reg_status does not exist" } };
        }
        return inner(op);
      },
    );
    const r = await resolveAudienceContactIds(F({ statuses: ["pending"] }));
    expect(r).toEqual({ ids: ["a", "b"], needsUpdate: false, statusNeedsUpdate: true, ignoredChoices: [] });
    expect((await resolveAudienceContactIds(F({ statuses: ["reserved"] }))).ids).toEqual([]);
    expect(await countAudience(F())).toMatchObject({ needsUpdate: false, statusNeedsUpdate: true, total: 2 });
    expect(await loadAudienceFile(F())).toMatchObject({ needsUpdate: false, statusNeedsUpdate: true });
    expect((await audienceFacets()).statusNeedsUpdate).toBe(true);
  });

  it("with the column present statusNeedsUpdate is false", async () => {
    withStatus();
    expect((await resolveAudienceContactIds(F())).statusNeedsUpdate).toBe(false);
    expect((await countAudience(F())).statusNeedsUpdate).toBe(false);
    expect((await loadAudienceFile(F())).statusNeedsUpdate).toBe(false);
  });

  it("facets count people per status, ignoring other filters", async () => {
    withStatus();
    const f = await audienceFacets();
    expect(f.statusCounts).toEqual({ paid: 1, reserved: 1, pending: 4, part_paid: 1, free: 1 });
    expect(f.statusNeedsUpdate).toBe(false);
  });
});

describe("mode from the text when reg_mode is empty", () => {
  it("purchase uses its label; interested uses the batch sheet name; reg_mode wins", async () => {
    setup({
      import_batches: [
        batch("b1", "closed_interested", { sheet_name: "Clinical Course Recorded (interested)" }),
        batch("b2", "closed_interested", { sheet_name: "Other (interested)" }),
      ],
      contacts: ["a", "b", "c", "d", "e"].map((i) => contact(i)),
      contact_purchases: [
        purchase("p1", "a", { product_label: "Clinical Course � Live � PKR 1" }),
        purchase("p2", "b", { product_label: "Clinical Course � Live � PKR 1", reg_mode: "recorded" }),
        purchase("p3", "c", { product_label: "Clinical Course � Live and Recorded" }),
      ],
      import_batch_contacts: [interested("b1", "d"), interested("b2", "e")],
    });
    expect(await ids({ mode: "live" })).toEqual(["a"]);
    expect(await ids({ mode: "recorded" })).toEqual(["b", "d"]);
  });
});

describe("resolveAudienceContactIds", () => {
  it("(a) recorded matches through the recorded landing purchase, never through the imported one", async () => {
    setup({
      contacts: [contact("a"), contact("b")],
      contact_purchases: [
        purchase("p1", "a", { product_label: "Pharmacology Basics — Individual — PKR 100" }),
        purchase("p2", "a", { course_id: "k-clin", reg_mode: "recorded" }),
        purchase("p3", "b", { course_id: "k-clin", reg_mode: "live" }),
      ],
    });
    expect(await ids({ mode: "recorded" })).toEqual(["a"]);
    expect(await ids({ mode: "recorded", courses: ["Pharmacology Basics"] })).toEqual([]);
    expect(await ids({ mode: "recorded", courses: ["Clinical Course"] })).toEqual(["a"]);
    expect(await ids({ mode: "live" })).toEqual(["b"]);
    expect(await ids({ mode: "either" })).toEqual(["a", "b"]);
  });

  it("(b) unpaid excludes anyone with any purchase, even in another course", async () => {
    setup({
      import_batches: [batch("bi", "closed_interested", { sheet_name: "Clinical Course (interested)" })],
      contacts: [contact("a"), contact("b")],
      contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" })],
      import_batch_contacts: [interested("bi", "a"), interested("bi", "b")],
    });
    expect(await ids({ statuses: ["reserved", "pending", "part_paid", "free"] })).toEqual(["b"]);
    expect(await ids({ statuses: ["reserved", "pending", "part_paid", "free"], courses: ["Clinical Course"] })).toEqual(["b"]);
    expect(await ids({ statuses: ["paid"] })).toEqual(["a"]);
    expect(await ids({ statuses: [] })).toEqual(["a", "b"]);
    // a's interest in Clinical Course does not count: a has a purchase.
    expect(await ids({ statuses: [], courses: ["Clinical Course"] })).toEqual(["b"]);
  });

  it("(c) two chosen courses mean either one, compared case-insensitively", async () => {
    setup({
      contacts: [contact("a"), contact("b"), contact("c")],
      contact_purchases: [
        purchase("p1", "a", { course_id: "k-pharm" }),
        purchase("p2", "b", { product_label: "Clinical Course — Group — PKR 900" }),
        purchase("p3", "c", { course_id: "k-other" }),
      ],
    });
    expect(await ids({ courses: ["pharmacology basics", "CLINICAL COURSE"] })).toEqual(["a", "b"]);
    expect(await ids({ courses: [] })).toEqual(["a", "b", "c"]);
  });

  it("(d) country unknown picks people whose country is null; several countries mean any", async () => {
    setup({
      contacts: [contact("a", { country: null }), contact("b", { country: "AE" }), contact("c", { country: "PK" })],
      contact_purchases: [purchase("p1", "a"), purchase("p2", "b"), purchase("p3", "c")],
    });
    expect(await ids({ countries: ["unknown"] })).toEqual(["a"]);
    expect(await ids({ countries: ["unknown", "AE"] })).toEqual(["a", "b"]);
    expect(await ids({ countries: [] })).toEqual(["a", "b", "c"]);
  });

  it("(e) a date filter with only from; people with no date are left out only then", async () => {
    setup({
      import_batches: [batch("bi", "closed_interested", { course_id: "k-clin" })],
      contacts: [contact("a"), contact("b"), contact("c"), contact("d")],
      contact_purchases: [
        purchase("p1", "a", { purchased_at: "2026-03-01T10:00:00+00:00", created_at: "2026-01-01T00:00:00+00:00" }),
        // No purchase date: falls back to the row's created time.
        purchase("p2", "b", { purchased_at: null, created_at: "2026-02-10T00:00:00+00:00" }),
      ],
      import_batch_contacts: [
        interested("bi", "c", { registered_at: "2026-04-02T08:00:00+00:00" }),
        interested("bi", "d", { registered_at: null }),
      ],
    });
    expect(await ids({ from: "2026-03-01" })).toEqual(["a", "c"]);
    expect(await ids({ to: "2026-02-10" })).toEqual(["b"]);
    expect(await ids({ from: "2026-02-10", to: "2026-03-01" })).toEqual(["a", "b"]);
    expect(await ids({})).toEqual(["a", "b", "c", "d"]);
  });

  it("all filters must hold on one single registration", async () => {
    setup({
      contacts: [contact("a")],
      contact_purchases: [
        purchase("p1", "a", { course_id: "k-pharm", reg_mode: "live", purchased_at: "2026-01-05T00:00:00+00:00" }),
        purchase("p2", "a", { course_id: "k-clin", reg_mode: "recorded", purchased_at: "2026-06-05T00:00:00+00:00" }),
      ],
    });
    expect(await ids({ courses: ["Pharmacology Basics"], mode: "recorded" })).toEqual([]);
    expect(await ids({ courses: ["Pharmacology Basics"], from: "2026-06-01" })).toEqual([]);
    expect(await ids({ courses: ["Clinical Course"], mode: "recorded", from: "2026-06-01" })).toEqual(["a"]);
  });

  it("(g) a missing column answers needsUpdate with an empty list and does not throw", async () => {
    setup({ contacts: [contact("a")], contact_purchases: [purchase("p1", "a")] }, (op, inner) => {
      if (op.table === "contact_purchases" && op.op === "select" && op.columns?.includes("reg_mode")) {
        return { data: null, error: { code: "42703", message: "column contact_purchases.reg_mode does not exist" } };
      }
      return inner(op);
    });
    expect(await resolveAudienceContactIds(F())).toEqual({ ids: [], needsUpdate: true, statusNeedsUpdate: false, ignoredChoices: [] });
    const count = await countAudience(F());
    expect(count).toMatchObject({ total: 0, inFile: 0, needsUpdate: true, tooLarge: false });
    expect(await loadAudienceFile(F())).toMatchObject({ contacts: [], tooLarge: false });
  });

  it("a missing column on the interested rows also answers needsUpdate", async () => {
    setup(
      { import_batches: [batch("bi", "closed_interested")], contacts: [contact("a")], import_batch_contacts: [interested("bi", "a")] },
      (op, inner) => {
        if (op.table === "import_batch_contacts" && op.columns?.includes("registered_at")) {
          return { data: null, error: { code: "PGRST204", message: "Could not find the 'registered_at' column in the schema cache" } };
        }
        return inner(op);
      },
    );
    expect((await resolveAudienceContactIds(F())).needsUpdate).toBe(true);
  });

  it("other read errors still throw, without contact details", async () => {
    setup({ contacts: [contact("a")], contact_purchases: [purchase("p1", "a")] }, (op, inner) => {
      if (op.table === "contact_purchases") return { data: null, error: { code: "57014", message: "timeout" } };
      return inner(op);
    });
    await expect(resolveAudienceContactIds(F())).rejects.toThrow("contact_purchases read failed");
  });

  it("(h) a chosen course that exists nowhere is reported and dropped from the filter", async () => {
    setup({
      contacts: [contact("a"), contact("b")],
      contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" }), purchase("p2", "b", { course_id: "k-clin" })],
    });
    expect(await resolveAudienceContactIds(F({ courses: ["Gone Course", "Pharmacology Basics"] }))).toEqual({
      ids: ["a"], needsUpdate: false, statusNeedsUpdate: false, ignoredChoices: ["Gone Course"],
    });
    expect(await resolveAudienceContactIds(F({ courses: ["Gone Course"] }))).toEqual({
      ids: ["a", "b"], needsUpdate: false, statusNeedsUpdate: false, ignoredChoices: ["Gone Course"],
    });
  });

  it("pages every read and keeps .in() lists at 200 or fewer", async () => {
    const n = 1300;
    const cid = (i: number) => `c${String(i).padStart(5, "0")}`;
    setup({
      import_batches: [batch("bi", "closed_interested")],
      contacts: Array.from({ length: n }, (_, i) => contact(cid(i), { country: i % 2 ? "AE" : "PK" })),
      contact_purchases: Array.from({ length: n }, (_, i) => purchase(`p${String(i).padStart(5, "0")}`, cid(i))),
      import_batch_contacts: Array.from({ length: n }, (_, i) => interested("bi", `z${i}`)),
    });
    const r = await ids({ countries: ["AE"], statuses: ["paid"] });
    expect(r).toHaveLength(650);
    for (const op of db.state.ops.filter((o) => o.op === "select")) {
      for (const [k, , v] of op.filters) if (k === "in") expect((v as unknown[]).length).toBeLessThanOrEqual(200);
    }
    expect(await ids({ statuses: ["reserved", "pending", "part_paid", "free"] })).toHaveLength(n);
    expect(db.find("contact_purchases", "select").every((o) => o.range)).toBe(true);
    expect(db.find("import_batch_contacts", "select").every((o) => o.range)).toBe(true);
  });
});

describe("countAudience", () => {
  it("(i) counts add up and carry no contact details", async () => {
    setup({
      contacts: [
        contact("a", { phone_e164: "+923001234567" }),
        contact("b", { do_not_contact_at: "2026-02-01T00:00:00+00:00" }),
        contact("c", { email: null, phone_e164: null }),
        contact("d", { email_unsubscribed_at: "2026-02-01T00:00:00+00:00", phone_e164: "+971501234567" }),
        contact("e", { email: "bounced@x.com" }),
      ],
      contact_purchases: ["a", "b", "c", "d", "e"].map((id, i) => purchase(`p${i}`, id)),
      email_metrics: [{ id: "m1", user_email: "bounced@x.com", event_type: "hard_bounce" }],
    });
    const c = await countAudience(F());
    expect(c).toEqual({
      total: 5, inFile: 2, leftOut: { noContact: 2, doNotContact: 1 }, tooLarge: false, needsUpdate: false, statusNeedsUpdate: false, ignoredChoices: [],
    });
    expect(c.total).toBe(c.inFile + c.leftOut.noContact + c.leftOut.doNotContact);
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/@|\+92|\+971/);
  });

  it("reports ignored choices", async () => {
    setup({ contacts: [contact("a")], contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" })] });
    const c = await countAudience(F({ courses: ["Gone Course"] }));
    expect(c.ignoredChoices).toEqual(["Gone Course"]);
    expect(c.total).toBe(1);
  });
});

describe("over the upper limit", () => {
  it("(f) more than 50,000 people sets tooLarge and never returns contacts", async () => {
    const N = 50001;
    const rows = Array.from({ length: N }, (_, i) => purchase(`p${String(i).padStart(6, "0")}`, `c${String(i).padStart(6, "0")}`));
    setup({}, (op, inner) => {
      // Fast path: rows are already in id order, so a range is a plain slice.
      if (op.table === "contact_purchases" && op.op === "select" && op.range) {
        return { data: rows.slice(op.range[0], op.range[1] + 1), error: null };
      }
      return inner(op);
    });
    const r = await resolveAudienceContactIds(F());
    expect(r.ids).toHaveLength(N);
    const c = await countAudience(F());
    expect(c.tooLarge).toBe(true);
    expect(c.total).toBe(N);
    expect(c.inFile).toBe(0);
    const file = await loadAudienceFile(F());
    expect(file).toMatchObject({ contacts: [], tooLarge: true });
    expect(db.find("contacts", "select")).toHaveLength(0);
    expect(db.find("email_metrics", "select")).toHaveLength(0);
  }, 30000);
});

describe("loadAudienceFile", () => {
  it("returns the matching contacts with suppression applied", async () => {
    setup({
      contacts: [contact("a"), contact("b", { country: "AE" })],
      contact_purchases: [purchase("p1", "a"), purchase("p2", "b")],
      email_metrics: [{ id: "m1", user_email: "a@x.com", event_type: "spam" }],
    });
    const r = await loadAudienceFile(F({ countries: ["PK"] }));
    expect(r.tooLarge).toBe(false);
    expect(r.contacts.map((c) => c.id)).toEqual(["a"]);
    expect(r.contacts[0].emailSuppressed).toBe(true);
  });

  it("reports ignored choices; when every chosen course is gone it reads no contacts", async () => {
    setup({
      contacts: [contact("a"), contact("b")],
      contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" }), purchase("p2", "b", { course_id: "k-clin" })],
    });
    const some = await loadAudienceFile(F({ courses: ["Gone Course", "Pharmacology Basics"] }));
    expect(some.ignoredChoices).toEqual(["Gone Course"]);
    expect(some.allCoursesGone).toBe(false);
    expect(some.contacts.map((c) => c.id)).toEqual(["a"]);

    db.reset();
    setup({
      contacts: [contact("a"), contact("b")],
      contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" }), purchase("p2", "b", { course_id: "k-clin" })],
    });
    const none = await loadAudienceFile(F({ courses: ["Gone Course", "Other Gone"] }));
    expect(none).toEqual({ contacts: [], tooLarge: false, needsUpdate: false, ignoredChoices: ["Gone Course", "Other Gone"], allCoursesGone: true, statusNeedsUpdate: false });
    expect(db.find("contacts", "select")).toHaveLength(0);

    const noCourses = await loadAudienceFile(F());
    expect(noCourses.allCoursesGone).toBe(false);
    expect(noCourses.ignoredChoices).toEqual([]);
  });
});

describe("audienceFacets", () => {
  it("lists courses, countries and landing pages with counts", async () => {
    setup({
      import_batches: [
        batch("bp", "closed_paid", { sheet_id: "landing:page-1", sheet_name: "Page One (paid)" }),
        batch("bi", "closed_interested", { sheet_id: "landing:page-1", sheet_name: "Clinical course (interested)" }),
      ],
      contacts: [contact("a", { country: "AE" }), contact("b", { country: null }), contact("c"), contact("x")],
      contact_purchases: [
        purchase("p1", "a", { course_id: "k-clin" }),
        purchase("p2", "a", { product_label: "Clinical Course — Individual — PKR 10" }),
        purchase("p3", "c", { product_label: "Individual — PKR 10" }),
      ],
      import_batch_contacts: [interested("bi", "b"), interested("bi", "a")],
      landing_pages: [
        { id: "page-1", title: "Page One", created_at: "2026-01-01T00:00:00+00:00" },
        { id: "page-2", title: "Page Two", created_at: "2026-02-01T00:00:00+00:00" },
      ],
      landing_registrations: [
        { id: "r1", page_id: "page-1", is_test: false },
        { id: "r2", page_id: "page-1", is_test: false },
        { id: "r3", page_id: "page-2", is_test: false },
        { id: "r4", page_id: "page-2", is_test: true },
      ],
    });
    const f = await audienceFacets();
    expect(f.needsUpdate).toBe(false);
    // "Clinical Course" and "Clinical course" are one course; first seen spelling wins.
    expect(f.courses).toEqual([
      { name: "Clinical Course", count: 2 },
      { name: "Unnamed", count: 1 },
    ]);
    expect(f.countries).toEqual([
      { code: "AE", count: 1 },
      { code: "PK", count: 1 },
    ]);
    expect(f.unknownCountry).toBe(1);
    expect(f.landingPages).toEqual([
      { id: "page-2", title: "Page Two", registrations: 1, alreadyBrought: false },
      { id: "page-1", title: "Page One", registrations: 2, alreadyBrought: true },
    ]);
  });

  it("lists only two-letter country codes; blanks count as not known, other values are dropped", async () => {
    setup({
      contacts: [
        contact("a", { country: "ae" }),
        contact("b", { country: " " }),
        contact("c", { country: "Pakistan" }),
        contact("d", { country: "P1" }),
        contact("e", { country: null }),
        contact("f", { country: "PK" }),
      ],
      contact_purchases: ["a", "b", "c", "d", "e", "f"].map((id, i) => purchase(`p${i}`, id, { course_id: "k-pharm" })),
    });
    const f = await audienceFacets();
    expect(f.countries).toEqual([
      { code: "AE", count: 1 },
      { code: "PK", count: 1 },
    ]);
    expect(f.unknownCountry).toBe(2);
  });

  it("before the update, still lists courses and answers needsUpdate", async () => {
    setup({ contacts: [contact("a")], contact_purchases: [purchase("p1", "a", { course_id: "k-pharm" })] }, (op, inner) => {
      if (op.table === "contact_purchases" && op.columns?.includes("reg_mode")) {
        return { data: null, error: { code: "42703", message: "column contact_purchases.reg_mode does not exist" } };
      }
      return inner(op);
    });
    const f = await audienceFacets();
    expect(f.needsUpdate).toBe(true);
    expect(f.courses).toEqual([{ name: "Pharmacology Basics", count: 1 }]);
  });
});

describe("loadAudienceContacts (shared with cohorts)", () => {
  it("(j) loadCohortAudience returns the same contacts as loading its people directly", async () => {
    setup({
      import_batches: [batch("b1", "imported")],
      contacts: [contact("a", { phone_e164: "+923001" }), contact("b", { do_not_contact_at: "2026-02-01" }), contact("c")],
      contact_purchases: ["a", "b", "c"].map((id, i) => purchase(`p${i}`, id, { import_batch_id: "b1" })),
      email_metrics: [{ id: "m1", user_email: "C@x.com", event_type: "hard_bounce" }],
    });
    const viaCohort = (await loadCohortAudience(["b1"])).contacts;
    const direct = await loadAudienceContacts(["c", "a", "b", "a"]);
    expect(direct).toEqual(viaCohort);
    expect(direct.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(direct.find((c) => c.id === "c")!.emailSuppressed).toBe(true);
  });

  it("reads chunks in parallel but returns contacts in id order, with suppression across every chunk", async () => {
    const n = 1150;
    const cid = (i: number) => `c${String(i).padStart(5, "0")}`;
    setup({
      contacts: Array.from({ length: n }, (_, i) => contact(cid(i))),
      email_metrics: [
        { id: "m1", user_email: `${cid(5)}@x.com`, event_type: "spam" },
        { id: "m2", user_email: `${cid(1149)}@X.com`, event_type: "hard_bounce" },
      ],
    });
    const shuffled = Array.from({ length: n }, (_, i) => cid((i * 7) % n));
    const out = await loadAudienceContacts(shuffled);
    expect(out.map((c) => c.id)).toEqual(Array.from({ length: n }, (_, i) => cid(i)));
    expect(out.filter((c) => c.emailSuppressed).map((c) => c.id)).toEqual([cid(5), cid(1149)]);
    expect(db.find("contacts", "select").length).toBe(6);
    expect(db.find("email_metrics", "select").length).toBe(12);
  });

  it("one failing chunk rejects with the plain message", async () => {
    const cid = (i: number) => `c${String(i).padStart(5, "0")}`;
    setup({ contacts: Array.from({ length: 700 }, (_, i) => contact(cid(i))) }, (op, inner) => {
      const list = op.filters.find(([k, f]) => k === "in" && f === "id")?.[2] as string[] | undefined;
      if (op.table === "contacts" && list?.includes(cid(450))) {
        return { data: null, error: { code: "57014", message: "timeout for c00450@x.com" } };
      }
      return inner(op);
    });
    await expect(loadAudienceContacts(Array.from({ length: 700 }, (_, i) => cid(i)))).rejects.toThrow(/^contacts read failed$/);
  });

  it("returns nothing for no ids, without reading", async () => {
    setup({});
    expect(await loadAudienceContacts([])).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
  });
});
