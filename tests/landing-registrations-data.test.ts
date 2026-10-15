// tests/landing-registrations-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler } from "./helpers/supabase-mock";
import { PPC_CONFIG, ppcPayload, groupMembers, contentWith } from "./helpers/landing-fixtures";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import {
  buildRegistrationRows, createRegistration, getRegistrationStatus, attachVoucher, findOpenRegistration,
  linkRegistrationsToStudent, countRecentRegistrations, getRegistrationBundle, markEmailStatus,
  type CreateRegistrationInput, type OkQuote,
} from "@/lib/data/landing-registrations";
import { registrationOptionLabel, buildVerifyMessage, whatsappVerifyUrl } from "@/lib/landing/registration/labels";

beforeEach(() => db.reset());

const quote = (over: Partial<OkQuote> = {}): OkQuote => ({
  ok: true, currency: "PKR", regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1,
  earlyBirdApplied: true, isFree: false, listPerPerson: 6000, perPerson: 4800, total: 4800, savings: 1200, ...over,
});
const input = (over: Partial<CreateRegistrationInput> = {}): CreateRegistrationInput => ({
  page: { id: "page-1", refPrefix: "PPC" }, config: PPC_CONFIG, payload: ppcPayload(), quote: quote(), promo: null,
  voucherUrl: "https://drive.google.com/file/d/v1/view", studentId: null, agentId: null, isTest: false, ...over,
});

describe("labels", () => {
  it("builds the registration option label", () => {
    expect(registrationOptionLabel(PPC_CONFIG, { mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1 }))
      .toBe("Live - Full Course - Individual");
    expect(registrationOptionLabel(PPC_CONFIG, { mode: "recorded", optionKeys: ["m1", "m2"], tierKey: "g3", groupSize: 3 }))
      .toBe("Recorded - Clinical Pharmacology Workshop, Acute & Chronic Therapeutics Workshop - Group of 3");
  });
  it("adds the head count for a variable-size tier and drops the mode when only one is offered", () => {
    const cfg = { ...PPC_CONFIG, modes: ["live" as const], tiers: [{ key: "grp", label: "Group (3+)", minSize: 3, maxSize: 50, percentOff: 20 }] };
    expect(registrationOptionLabel(cfg, { mode: "live", optionKeys: ["full"], tierKey: "grp", groupSize: 7 }))
      .toBe("Full Course - Group (3+), 7 people");
  });
  it("builds the legacy WhatsApp verify message", () => {
    expect(buildVerifyMessage(PPC_CONFIG, { name: "Ayesha Khan", email: "a@b.com", refId: "PZA-PPC-001", optionLabel: "Live - Full Course - Individual", isFree: false }))
      .toBe("Hi PZ Academy! I just registered for PPC Batch 3 and submitted my payment voucher.\n\nName: Ayesha Khan\nEmail: a@b.com\nRef: PZA-PPC-001\nRegistration: Live - Full Course - Individual\n\nPlease verify my payment. Thank you!");
    expect(buildVerifyMessage(PPC_CONFIG, { name: "x", email: "x", refId: "x", optionLabel: "x", isFree: true })).toBe("");
    expect(buildVerifyMessage({ ...PPC_CONFIG, whatsappVerifyNumber: "" }, { name: "x", email: "x", refId: "x", optionLabel: "x", isFree: false })).toBe("");
  });
  it("encodes the wa.me link, apostrophes included", () => {
    expect(whatsappVerifyUrl("+92 370 0199429", "Hi O'Brien & co")).toBe("https://wa.me/923700199429?text=Hi%20O%27Brien%20%26%20co");
  });
});

describe("buildRegistrationRows", () => {
  it("individual: one row, lowercased email, total, pending", () => {
    const [row, ...rest] = buildRegistrationRows(input());
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      page_id: "page-1", row_type: "individual", name: "Ayesha Khan", email: "ayesha@example.com", expected_amount: 4800,
      currency: "PKR", status: "pending", payment_method: "faysal", voucher_url: "https://drive.google.com/file/d/v1/view",
      option_label: "Live - Full Course - Individual", option_keys: ["full"], consent: true, is_test: false,
      promo_code_id: null, promo_code_text: "", region: "PK", mode: "live", tier_key: "individual", group_size: 1,
      session_id: "sess-0001-abcd", event_id: "evt-0001", referral_code: "", fbp: "", fbc: "",
    });
    // NOT NULL text columns (Task 1) never receive null.
    for (const [k, v] of Object.entries(row)) {
      if (!["promo_code_id", "agent_id", "student_id", "lead_registration_id", "amount_received"].includes(k)) expect(v, k).not.toBeNull();
    }
  });
  it("group: lead first, then members with no money, voucher or student link", () => {
    const rows = buildRegistrationRows(input({
      payload: ppcPayload({ tierKey: "g3", groupSize: 3, members: groupMembers(2) }),
      quote: quote({ tierKey: "g3", groupSize: 3, total: 11500, perPerson: 3833 }),
      studentId: "user-1",
    }));
    expect(rows.map((r) => r.row_type)).toEqual(["lead", "member", "member"]);
    expect(rows[0]).toMatchObject({ expected_amount: 11500, student_id: "user-1" });
    expect(rows[1]).toMatchObject({ email: "member1@example.com", expected_amount: 0, voucher_url: "", payment_method: "", student_id: null, consent: true, session_id: "sess-0001-abcd" });
  });
  it("applies the promo total and records the code", () => {
    const [row] = buildRegistrationRows(input({ promo: { ok: true, promoId: "promo-1", code: "PZ10", discount: 480, total: 4320 } }));
    expect(row).toMatchObject({ expected_amount: 4320, promo_code_id: "promo-1", promo_code_text: "PZ10" });
  });
  it("a zero discount is not a promo use", () => {
    const [row] = buildRegistrationRows(input({ promo: { ok: true, promoId: "promo-1", code: "PZ0", discount: 0, total: 4800 } }));
    expect(row).toMatchObject({ expected_amount: 4800, promo_code_id: null, promo_code_text: "" });
  });
  it("free registrations are status free with no payment method", () => {
    const [row] = buildRegistrationRows(input({ quote: quote({ isFree: true, total: 0 }), voucherUrl: "" }));
    expect(row).toMatchObject({ status: "free", payment_method: "", voucher_url: "", expected_amount: 0 });
  });
  it("cleans attribution", () => {
    const [row] = buildRegistrationRows(input({
      payload: ppcPayload({ attribution: { refCode: " Ayesha-7K2 ", utm: { utm_source: "fb", junk: "x" }, fbp: "fb.1", fbc: "", eventId: "evt-1", sessionId: "s-12345678" } }),
      agentId: "agent-1",
    }));
    expect(row).toMatchObject({ referral_code: "ayesha-7k2", utm: { utm_source: "fb" }, fbp: "fb.1", fbc: "", event_id: "evt-1", session_id: "s-12345678", agent_id: "agent-1" });
  });
});

describe("createRegistration", () => {
  it("calls the RPC with the built rows and returns the ref", async () => {
    db.state.handler = (op) => (op.op === "rpc" ? { data: { ref_id: "PZA-PPC-001", registration_ids: ["reg-1"] }, error: null } : { data: null, error: null });
    const r = await createRegistration(input());
    expect(r).toEqual({ ok: true, refId: "PZA-PPC-001", registrationIds: ["reg-1"], total: 4800, currency: "PKR" });
    const call = db.find("landing_create_registration", "rpc")[0].payload as Record<string, unknown>;
    expect(call).toMatchObject({ p_page_id: "page-1", p_promo_id: null, p_is_test: false, p_capacity: 0 });
    expect((call.p_rows as unknown[]).length).toBe(1);
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
  it("maps the RPC's exhausted and capacity errors", async () => {
    db.state.handler = () => ({ data: null, error: { code: "P0001", message: "promo_exhausted" } });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "promo_exhausted" });
    db.state.handler = () => ({ data: null, error: { code: "P0001", message: "capacity_full" } });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "capacity_full" });
    db.state.handler = () => ({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "db-error" });
  });
  it("maps unexpected Postgres errors to db-error without leaking text, and sends no promo id for a zero discount", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.state.handler = () => ({ data: null, error: { code: "23514", message: 'new row violates check constraint "secret_name"' } });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "db-error" });
    db.state.handler = () => ({ data: null, error: { code: "P0001", message: "invalid_rows" } });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "db-error" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret_name");
    spy.mockRestore();
    db.reset();
    db.state.handler = (op) => (op.op === "rpc" ? { data: { ref_id: "PZA-PPC-001", registration_ids: ["reg-1"] }, error: null } : { data: null, error: null });
    await createRegistration(input({ promo: { ok: true, promoId: "promo-1", code: "pz0", discount: 0, total: 4800 } }));
    expect((db.find("landing_create_registration", "rpc")[0].payload as Record<string, unknown>).p_promo_id).toBeNull();
  });
  it("rejects a malformed RPC reply", async () => {
    db.state.handler = () => ({ data: { ref_id: "" }, error: null });
    expect(await createRegistration(input())).toEqual({ ok: false, reason: "db-error" });
  });
  it("backfills the page ref prefix once, never for test registrations", async () => {
    db.state.handler = (op) => (op.op === "rpc" ? { data: { ref_id: "PZA-PPC-001", registration_ids: ["reg-1"] }, error: null } : { data: null, error: null });
    await createRegistration(input({ page: { id: "page-1", refPrefix: null } }));
    const upd = db.find("landing_pages", "update")[0];
    expect(upd.payload).toEqual({ ref_prefix: "PPC" });
    expect(upd.filters).toEqual(expect.arrayContaining([["eq", "id", "page-1"], ["is", "ref_prefix", null]]));
    db.reset();
    db.state.handler = () => ({ data: { ref_id: "TEST-12345", registration_ids: ["reg-1"] }, error: null });
    await createRegistration(input({ page: { id: "page-1", refPrefix: null }, isTest: true }));
    expect(db.find("landing_pages", "update")).toHaveLength(0);
  });
});

const lead = (over: Record<string, unknown> = {}) => ({
  id: "r1", page_id: "page-1", row_type: "individual", lead_registration_id: null, ref_id: "PZA-PPC-001",
  name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "+923001234567", profession: "Pharmacist", city: "Lahore",
  region: "PK", discovery: "WhatsApp", consent: true, option_label: "Live - Full Course - Individual", option_keys: ["full"],
  mode: "live", tier_key: "individual", group_size: 1, promo_code_id: null, promo_code_text: "", expected_amount: 4800,
  currency: "PKR", payment_method: "faysal", voucher_url: "https://drive.google.com/file/d/v1/view", status: "pending",
  amount_received: null, email_status: "", student_id: null, agent_id: null, referral_code: "", utm: {},
  fbp: "", fbc: "", event_id: "", session_id: "", is_test: false, created_at: "2026-10-13T10:00:00.000Z", ...over,
});
const member = (over: Record<string, unknown> = {}) =>
  lead({ id: "r2", row_type: "member", lead_registration_id: "r1", ref_id: null, name: "Bilal", email: "bilal@example.com",
    expected_amount: 0, voucher_url: "", payment_method: "", created_at: "2026-10-13T10:00:01.000Z", ...over });

describe("getRegistrationStatus", () => {
  const store = () => ({
    landing_registrations: [lead({ row_type: "lead", status: "paid" }), member({ status: "pending" })],
    landing_pages: [{ id: "page-1", title: "PPC Batch 3 page", published: contentWith(PPC_CONFIG) }],
  });
  it("matches ref plus email, normalizing both", async () => {
    db.state.handler = memoryHandler(store());
    expect(await getRegistrationStatus("pza-ppc-001", "  AYESHA@example.com ")).toEqual({ status: "paid", name: "Ayesha Khan", eventLabel: "PPC Batch 3" });
  });
  it("a member uses the lead's ref and shares the lead's status", async () => {
    db.state.handler = memoryHandler(store());
    expect(await getRegistrationStatus("PZA-PPC-001", "bilal@example.com")).toEqual({ status: "paid", name: "Bilal", eventLabel: "PPC Batch 3" });
  });
  it("returns null for a wrong email or an unknown ref", async () => {
    db.state.handler = memoryHandler(store());
    expect(await getRegistrationStatus("PZA-PPC-001", "someone@else.com")).toBeNull();
    expect(await getRegistrationStatus("PZA-PPC-999", "ayesha@example.com")).toBeNull();
    expect(await getRegistrationStatus("", "")).toBeNull();
  });
  it("with a page id, a ref that belongs to another page is null", async () => {
    db.state.handler = memoryHandler(store());
    expect(await getRegistrationStatus("PZA-PPC-001", "ayesha@example.com", "page-1")).toEqual({ status: "paid", name: "Ayesha Khan", eventLabel: "PPC Batch 3" });
    expect(await getRegistrationStatus("PZA-PPC-001", "ayesha@example.com", "page-2")).toBeNull();
    expect(filterValue(db.find("landing_registrations", "select").at(-1)!, "eq", "page_id")).toBe("page-2");
  });
});

describe("attachVoucher and findOpenRegistration", () => {
  it("attaches a voucher only to a pending or underpaid registration", async () => {
    const s = { landing_registrations: [lead()] };
    db.state.handler = memoryHandler(s);
    expect(await attachVoucher("PZA-PPC-001", "Ayesha@example.com", "https://drive.google.com/file/d/v2/view")).toBe(true);
    expect(s.landing_registrations[0].voucher_url).toBe("https://drive.google.com/file/d/v2/view");
    expect(filterValue(db.find("landing_registrations", "update")[0], "in", "status")).toEqual(["pending", "underpaid"]);
    s.landing_registrations[0].status = "paid";
    expect(await attachVoucher("PZA-PPC-001", "ayesha@example.com", "https://drive.google.com/file/d/v3/view")).toBe(false);
  });
  it("finds the open real registration for this page and email", async () => {
    db.state.handler = memoryHandler({
      landing_registrations: [
        lead({ id: "t1", ref_id: "TEST-12345", is_test: true }),
        lead({ id: "p1", ref_id: "PZA-PPC-002", status: "paid" }),
        lead({ id: "o1", ref_id: "PZA-PPC-003", status: "underpaid" }),
        member({ id: "m9", email: "ayesha@example.com" }),
      ],
    });
    expect(await findOpenRegistration("page-1", "AYESHA@example.com")).toEqual({
      id: "o1", refId: "PZA-PPC-003", status: "underpaid", name: "Ayesha Khan", optionLabel: "Live - Full Course - Individual",
      optionKeys: ["full"], mode: "live", expectedAmount: 4800, currency: "PKR",
    });
    expect(await findOpenRegistration("page-2", "ayesha@example.com")).toBeNull();
  });
});

describe("student linking and rate-limit counts", () => {
  it("links unlinked real registrations by email and returns the count", async () => {
    const s = { landing_registrations: [lead({ id: "a" }), member({ id: "b", email: "ayesha@example.com" }), lead({ id: "c", student_id: "other" }), lead({ id: "d", is_test: true })] };
    db.state.handler = memoryHandler(s);
    expect(await linkRegistrationsToStudent("user-1", "Ayesha@Example.com")).toBe(2);
    expect(s.landing_registrations.map((r) => r.student_id)).toEqual(["user-1", "user-1", "other", null]);
  });
  it("linking never throws", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    expect(await linkRegistrationsToStudent("user-1", "a@b.com")).toBe(0);
  });
  it("counts recent lead and individual rows for an email, 0 on error", async () => {
    db.state.handler = () => ({ data: null, error: null, count: 2 });
    expect(await countRecentRegistrations("A@B.com", "2026-10-13T09:50:00.000Z")).toBe(2);
    const op = db.find("landing_registrations", "select")[0];
    expect(filterValue(op, "eq", "email")).toBe("a@b.com");
    expect(filterValue(op, "gte", "created_at")).toBe("2026-10-13T09:50:00.000Z");
    expect(filterValue(op, "in", "row_type")).toEqual(["individual", "lead"]);
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    expect(await countRecentRegistrations("a@b.com", "x")).toBe(0);
  });
});

describe("bundles for background jobs", () => {
  it("loads the lead and its members in order", async () => {
    db.state.handler = memoryHandler({ landing_registrations: [member({ id: "r3", created_at: "2026-10-13T10:00:02.000Z" }), lead({ row_type: "lead" }), member()] });
    const b = await getRegistrationBundle("r1");
    expect(b?.lead).toMatchObject({ id: "r1", refId: "PZA-PPC-001", rowType: "lead", expectedAmount: 4800, optionKeys: ["full"], consent: true, utm: {} });
    expect(b?.members.map((m) => m.id)).toEqual(["r2", "r3"]);
    expect(await getRegistrationBundle("nope")).toBeNull();
  });
  it("marks the email status", async () => {
    db.state.handler = memoryHandler({ landing_registrations: [lead()] });
    await markEmailStatus("r1", "received_sent");
    const upd = db.find("landing_registrations", "update")[0];
    expect(upd.payload).toEqual({ email_status: "received_sent" });
    expect(filterValue(upd, "eq", "id")).toBe("r1");
  });
});
