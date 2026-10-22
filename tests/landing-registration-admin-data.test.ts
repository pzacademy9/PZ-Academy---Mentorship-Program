// tests/landing-registration-admin-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const jobs = vi.hoisted(() => ({ enqueueSheetStatus: vi.fn(), enqueueStatusEffects: vi.fn(), runJobsFor: vi.fn(), runJobsDirect: vi.fn(), runInBackground: vi.fn() }));
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueSheetStatus: jobs.enqueueSheetStatus, enqueueStatusEffects: jobs.enqueueStatusEffects, runJobsFor: jobs.runJobsFor, runJobsDirect: jobs.runJobsDirect }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: jobs.runInBackground }));

const enr = vi.hoisted(() => ({ resolveAccess: vi.fn(), listEmailLog: vi.fn() }));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: enr.resolveAccess }));
vi.mock("@/lib/data/landing-email-log", () => ({ listEmailLog: enr.listEmailLog }));
const msgs = vi.hoisted(() => ({ listMessagesForRegistrations: vi.fn() }));
vi.mock("@/lib/data/participant-sends", () => ({ listMessagesForRegistrations: msgs.listMessagesForRegistrations }));

const meta = vi.hoisted(() => ({ getMetaPurchase: vi.fn() }));
vi.mock("@/lib/data/landing-meta-events", () => ({ getMetaPurchase: meta.getMetaPurchase }));

import { listRegistrationPageOptions, listRegistrationAgentOptions, listRegistrations, getRegistrationDetail, changeRegistrationStatus } from "@/lib/data/landing-registration-admin";

const reg = (over: Record<string, unknown>) => ({
  page_id: "pg1", row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: "n@x.com",
  option_label: "Live", mode: "live", region: "PK", expected_amount: 5000, amount_received: null, currency: "PKR",
  status: "pending", status_source: "app", status_changed_at: null, agent_id: null, group_size: 1, is_test: false,
  created_at: "2026-10-01T00:00:00Z", ...over,
});
const seed = (): Store => ({
  landing_registrations: [
    reg({ id: "a", name: "Ayesha", ref_id: "PZA-1", agent_id: "ag1", created_at: "2026-10-03T00:00:00Z" }),
    reg({ id: "b", name: "Bilal", ref_id: "PZA-2", agent_id: "ag2", status: "paid", created_at: "2026-10-02T00:00:00Z" }),
    reg({ id: "t", name: "Tester", ref_id: "PZA-3", agent_id: "ag1", is_test: true }),
    reg({ id: "L", name: "Lead", ref_id: "PZA-4", row_type: "lead", agent_id: "ag1", group_size: 2, status: "underpaid", amount_received: 100 }),
    reg({ id: "m1", name: "Member", row_type: "member", lead_registration_id: "L", agent_id: "ag1", status: "underpaid" }),
    reg({ id: "f", name: "Free", ref_id: "PZA-5", status: "free", agent_id: "ag1" }),
  ],
  landing_pages: [{ id: "pg1", title: "PPC", slug: "ppc" }],
  profiles: [{ id: "ag1", full_name: "Agent One" }, { id: "ag2", full_name: "Agent Two" }, { id: "adm", full_name: "Admin Person" }],
  landing_status_events: [
    { id: "e1", registration_id: "L", from_status: "pending", to_status: "underpaid", source: "app", changed_by: "adm", at: "2026-10-04T00:00:00Z" },
    { id: "e2", registration_id: "m1", from_status: "pending", to_status: "underpaid", source: "sheet", changed_by: null, at: "2026-10-04T00:00:00Z" },
  ],
});
let store: Store;
let rpcResult: { data: unknown; error: unknown };
beforeEach(() => {
  db.reset();
  for (const f of Object.values(jobs)) f.mockReset();
  jobs.enqueueSheetStatus.mockResolvedValue(true);
  jobs.enqueueStatusEffects.mockResolvedValue(true);
  jobs.runJobsFor.mockResolvedValue(undefined);
  enr.resolveAccess.mockReset();
  enr.listEmailLog.mockReset();
  enr.listEmailLog.mockResolvedValue([]);
  meta.getMetaPurchase.mockReset();
  meta.getMetaPurchase.mockResolvedValue(null);
  msgs.listMessagesForRegistrations.mockReset();
  msgs.listMessagesForRegistrations.mockResolvedValue([]);
  enr.resolveAccess.mockResolvedValue({ lead: { mode: "live" }, courseId: null, hasAccount: false });
  store = seed();
  rpcResult = { data: { ok: true, from: "pending", changed: 2 }, error: null };
  db.state.handler = memoryHandler(store, () => rpcResult);
});

const admin = { userId: "adm", role: "admin" as const };
const agent = (id = "ag1") => ({ userId: id, role: "sales_agent" as const });
const regReads = () => db.find("landing_registrations", "select");

describe("list", () => {
  it("list for agent scope filters agent_id and excludes test rows", async () => {
    const out = await listRegistrations({ kind: "agent", agentId: "ag1" }, {});
    expect(out.rows.map((r) => r.id).sort()).toEqual(["L", "a", "f"]);
    for (const op of regReads()) {
      expect(filterValue(op, "eq", "agent_id")).toBe("ag1");
      expect(filterValue(op, "eq", "is_test")).toBe(false);
    }
  });
  it("agent scope ignores a caller-supplied agentId filter", async () => {
    const out = await listRegistrations({ kind: "agent", agentId: "ag1" }, { agentId: "ag2" });
    expect(out.rows.map((r) => r.id)).not.toContain("b");
  });
  it("list for all scope hides test rows unless includeTest", async () => {
    expect((await listRegistrations({ kind: "all" }, {})).rows.map((r) => r.id)).not.toContain("t");
    expect((await listRegistrations({ kind: "all", includeTest: true }, {})).rows.map((r) => r.id)).toContain("t");
  });
  it("list returns only individual and lead rows", async () => {
    const out = await listRegistrations({ kind: "all" }, {});
    expect(out.rows.map((r) => r.id)).not.toContain("m1");
    expect(filterValue(regReads()[0], "in", "row_type")).toEqual(["individual", "lead"]);
  });
  it("list maps page and agent names", async () => {
    const out = await listRegistrations({ kind: "all" }, {});
    const a = out.rows.find((r) => r.id === "a")!;
    expect(a).toMatchObject({ pageTitle: "PPC", agentName: "Agent One", refId: "PZA-1", status: "pending" });
  });
  it("region and optionLabel filters apply as equals", async () => {
    store.landing_registrations.push(reg({ id: "u", name: "Uae", ref_id: "PZA-7", region: "UAE", option_label: "Gold" }));
    const out = await listRegistrations({ kind: "all" }, { region: "UAE" });
    expect(out.rows.map((r) => r.id)).toEqual(["u"]);
    expect(out.total).toBe(1);
    expect((await listRegistrations({ kind: "all" }, { optionLabel: "Gold" })).rows.map((r) => r.id)).toEqual(["u"]);
    expect((await listRegistrations({ kind: "all" }, { region: "UAE", optionLabel: "Live" })).rows).toEqual([]);
  });
  it("search with % _ and commas is escaped and does not widen the match", async () => {
    await listRegistrations({ kind: "all" }, { q: "50%_a,b\\c" });
    const expr = String(filterValue(regReads()[0], "or", "or"));
    expect(expr).toContain("name.ilike.");
    expect(expr).toContain("email.ilike.");
    expect(expr).toContain("ref_id.ilike.");
    // LIKE wildcards are neutralised with a backslash (itself escaped for the quoted string),
    // and the value is double-quoted so the comma cannot split the or() list.
    expect(expr).toContain('"%50\\\\%\\\\_a,b\\\\\\\\c%"');
    expect(expr.replace(/"(?:[^"\\]|\\.)*"/g, '""').split(",")).toHaveLength(3);
  });
  it("search escapes * so PostgREST cannot turn it into a wildcard", async () => {
    await listRegistrations({ kind: "all" }, { q: "a*b" });
    const expr = String(filterValue(regReads()[0], "or", "or"));
    expect(expr).toContain('"%a\\\\*b%"');
  });
  it("agent scope with an empty agentId lists nothing and never reads everything", async () => {
    for (const agentId of ["", undefined as unknown as string]) {
      const out = await listRegistrations({ kind: "agent", agentId }, {});
      expect(out.rows).toEqual([]);
      expect(out.total).toBe(0);
      expect(out.counts.all).toBe(0);
    }
    for (const op of regReads()) expect(filterValue(op, "eq", "agent_id") ?? "").toBe("");
  });
  it("status filter and counts per status", async () => {
    const out = await listRegistrations({ kind: "all" }, { status: "pending" });
    expect(out.rows.map((r) => r.id)).toEqual(["a"]);
    expect(out.total).toBe(1);
    expect(out.pageSize).toBe(25);
    expect(out.counts).toEqual({ all: 4, pending: 1, paid: 1, underpaid: 1, reserved: 0, free: 1 });
  });
});

describe("detail", () => {
  it("detail for non-owned agent id returns null", async () => {
    expect(await getRegistrationDetail("b", { kind: "agent", agentId: "ag1" })).toBeNull();
    expect(await getRegistrationDetail("t", { kind: "agent", agentId: "ag1" })).toBeNull();
  });
  it("detail for an unassigned registration is not found for an agent", async () => {
    store.landing_registrations.push(reg({ id: "u", agent_id: null }));
    expect(await getRegistrationDetail("u", { kind: "agent", agentId: "ag1" })).toBeNull();
  });
  it("detail returns members and events with actor names", async () => {
    const d = await getRegistrationDetail("L", { kind: "agent", agentId: "ag1" });
    expect(d!.lead.id).toBe("L");
    expect(d!.members.map((m) => m.id)).toEqual(["m1"]);
    expect(d!.page).toEqual({ id: "pg1", title: "PPC", slug: "ppc" });
    expect(d!.agentName).toBe("Agent One");
    expect(d!.events).toHaveLength(2);
    expect(d!.events.find((e) => e.source === "app")).toMatchObject({ actorName: "Admin Person", registrationName: "Lead", to: "underpaid" });
    expect(d!.events.find((e) => e.source === "sheet")).toMatchObject({ actorName: null, registrationName: "Member" });
  });
  it("detail with an empty agent id is null, never the row", async () => {
    expect(await getRegistrationDetail("a", { kind: "agent", agentId: "" })).toBeNull();
    expect(await getRegistrationDetail("u", { kind: "agent", agentId: "" })).toBeNull();
  });
  it("detail of a member id is not found", async () => {
    expect(await getRegistrationDetail("m1", { kind: "all" })).toBeNull();
  });
});

describe("detail messages from the team", () => {
  const message = { registrationId: "m1", channel: "email", subject: "Module 2", state: "sent", sentAt: "2026-10-15T11:42:00Z", sendCreatedAt: "2026-10-15T11:40:00Z" };
  it("admin gets the messages sent to the lead and the members", async () => {
    msgs.listMessagesForRegistrations.mockResolvedValue([message]);
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(msgs.listMessagesForRegistrations).toHaveBeenCalledWith(["L", "m1"]);
    expect(d!.messages).toEqual([message]);
  });
  it("agent gets none and the messages are never even read", async () => {
    msgs.listMessagesForRegistrations.mockResolvedValue([message]);
    const d = await getRegistrationDetail("L", { kind: "agent", agentId: "ag1" });
    expect(d!.messages).toEqual([]);
    expect(msgs.listMessagesForRegistrations).not.toHaveBeenCalled();
  });
});

describe("detail Meta Purchase status", () => {
  const setLead = (over: Record<string, unknown>) => Object.assign(store.landing_registrations.find((r) => r.id === "L")!, over);
  it("no row, lead paid, not test: waiting", async () => {
    setLead({ status: "paid" });
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(meta.getMetaPurchase).toHaveBeenCalledWith("L");
    expect(d!.metaPurchase).toEqual({ state: "waiting", at: null });
  });
  it("no row, lead not paid: none", async () => {
    expect((await getRegistrationDetail("L", { kind: "all" }))!.metaPurchase).toEqual({ state: "none", at: null });
  });
  it("no row, paid test lead: none", async () => {
    setLead({ status: "paid", is_test: true });
    expect((await getRegistrationDetail("L", { kind: "all", includeTest: true }))!.metaPurchase).toEqual({ state: "none", at: null });
  });
  it("claimed row: waiting", async () => {
    meta.getMetaPurchase.mockResolvedValue({ state: "claimed", sentAt: null, detail: "" });
    expect((await getRegistrationDetail("L", { kind: "all" }))!.metaPurchase).toEqual({ state: "waiting", at: null });
  });
  it("sent row: sent with its time", async () => {
    meta.getMetaPurchase.mockResolvedValue({ state: "sent", sentAt: "2026-10-22T08:00:00Z", detail: "" });
    expect((await getRegistrationDetail("L", { kind: "all" }))!.metaPurchase).toEqual({ state: "sent", at: "2026-10-22T08:00:00Z" });
  });
  it("skipped_old row: skipped_old", async () => {
    meta.getMetaPurchase.mockResolvedValue({ state: "skipped_old", sentAt: null, detail: "" });
    expect((await getRegistrationDetail("L", { kind: "all" }))!.metaPurchase).toEqual({ state: "skipped_old", at: null });
  });
  it("agent never gets Meta data and it is never read", async () => {
    setLead({ status: "paid" });
    meta.getMetaPurchase.mockResolvedValue({ state: "sent", sentAt: "2026-10-22T08:00:00Z", detail: "" });
    const d = await getRegistrationDetail("L", { kind: "agent", agentId: "ag1" });
    expect(d!.metaPurchase).toEqual({ state: "none", at: null });
    expect(meta.getMetaPurchase).not.toHaveBeenCalled();
  });
});

describe("detail emails and access", () => {
  const withCourse = (over: Record<string, unknown> = {}) => {
    store.landing_registrations.find((r) => r.id === "L")!.student_id = "stu1";
    enr.resolveAccess.mockResolvedValue({ lead: { mode: "live" }, courseId: "c1", hasAccount: true, ...over });
    store.modules = [
      { id: "m_b", course_id: "c1", title: "Beta", order_index: 2 },
      { id: "m_a", course_id: "c1", title: "Alpha", order_index: 1 },
      { id: "m_x", course_id: "c2", title: "Other course", order_index: 1 },
    ];
  };
  it("admin with a Live enrollment and one open module", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: true, access_level: "live" }];
    store.enrollment_modules = [];
    store.enrollment_open_modules = [{ enrollment_id: "e1", module_id: "m_a" }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access).toEqual({
      mode: "live", hasAccount: true, enrollmentStatus: "active", portalOpen: true, hasCourse: true,
      modules: [{ id: "m_a", title: "Alpha", open: true }, { id: "m_b", title: "Beta", open: false }],
    });
  });
  it("covered modules only when the enrollment has enrollment_modules rows", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: true, access_level: "live" }];
    store.enrollment_modules = [{ enrollment_id: "e1", module_id: "m_b" }];
    store.enrollment_open_modules = [{ enrollment_id: "e1", module_id: "m_b" }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access.modules).toEqual([{ id: "m_b", title: "Beta", open: true }]);
  });
  it("guest without an account has no enrollment status", async () => {
    enr.resolveAccess.mockResolvedValue({ lead: { mode: "recorded" }, courseId: "c1", hasAccount: false });
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access).toEqual({ mode: "recorded", hasAccount: false, enrollmentStatus: null, portalOpen: null, hasCourse: true, modules: null });
  });
  it("recorded active and open enrollment opens every module", async () => {
    withCourse({ lead: { mode: "recorded" } });
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: true, access_level: "recorded" }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access.modules).toEqual([{ id: "m_a", title: "Alpha", open: true }, { id: "m_b", title: "Beta", open: true }]);
  });
  it("a closed portal opens nothing", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: false, access_level: "live" }];
    store.enrollment_open_modules = [{ enrollment_id: "e1", module_id: "m_a" }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access.portalOpen).toBe(false);
    expect(d!.access.modules!.every((m) => !m.open)).toBe(true);
  });
  it("agent scope returns access but no emails and never asks for the email log", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: true, access_level: "recorded" }];
    enr.listEmailLog.mockResolvedValue([{ registrationId: "L", kind: "paid", toEmail: "x@y.com", sentAt: "2026-10-05T00:00:00Z" }]);
    const d = await getRegistrationDetail("L", { kind: "agent", agentId: "ag1" });
    expect(d!.emails).toEqual([]);
    expect(enr.listEmailLog).not.toHaveBeenCalled();
    expect(d!.access.enrollmentStatus).toBe("active");
  });
  it("an account and a course but no enrollment yet: modules stay null", async () => {
    withCourse();
    store.enrollments = [];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access).toEqual({ mode: "live", hasAccount: true, enrollmentStatus: null, portalOpen: null, hasCourse: true, modules: null });
  });
  it("a cancelled enrollment with portal_open true opens nothing", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "cancelled", portal_open: true, access_level: "live" }];
    store.enrollment_open_modules = [{ enrollment_id: "e1", module_id: "m_a" }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access.enrollmentStatus).toBe("cancelled");
    expect(d!.access.modules!.every((m) => !m.open)).toBe(true);
  });
  it("a null access_level on an active open enrollment is treated like recorded: every module open", async () => {
    withCourse();
    store.enrollments = [{ id: "e1", student_id: "stu1", course_id: "c1", status: "active", portal_open: true, access_level: null }];
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access.modules).toEqual([{ id: "m_a", title: "Alpha", open: true }, { id: "m_b", title: "Beta", open: true }]);
  });
  it("a page with no course returns an empty access", async () => {
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(d!.access).toEqual({ mode: "live", hasAccount: false, enrollmentStatus: null, portalOpen: null, hasCourse: false, modules: null });
    expect(db.find("enrollments", "select")).toHaveLength(0);
  });
  it("emails cover lead and members, newest first", async () => {
    enr.listEmailLog.mockResolvedValue([
      { registrationId: "L", kind: "reserved", toEmail: "lead@x.com", sentAt: "2026-10-02T00:00:00Z" },
      { registrationId: "m1", kind: "paid", toEmail: "m@x.com", sentAt: "2026-10-05T00:00:00Z" },
      { registrationId: "L", kind: "portal_link", toEmail: "lead@x.com", sentAt: "2026-10-03T00:00:00Z" },
    ]);
    const d = await getRegistrationDetail("L", { kind: "all" });
    expect(enr.listEmailLog).toHaveBeenCalledWith(["L", "m1"]);
    expect(d!.emails.map((m) => m.sentAt)).toEqual(["2026-10-05T00:00:00Z", "2026-10-03T00:00:00Z", "2026-10-02T00:00:00Z"]);
    expect(d!.emails[0]).toEqual({ kind: "paid", toEmail: "m@x.com", sentAt: "2026-10-05T00:00:00Z" });
  });
});

describe("change", () => {
  const rpcs = () => db.state.ops.filter((o) => o.op === "rpc");
  const writes = () => db.state.ops.filter((o) => o.op === "update" || o.op === "insert");

  it("change: member id returns member-row and calls no rpc", async () => {
    const r = await changeRegistrationStatus({ registrationId: "m1", to: "paid", expectedFrom: "underpaid", actor: admin });
    expect(r).toEqual({ ok: false, reason: "member-row" });
    expect(rpcs()).toHaveLength(0);
  });
  it("change: agent not owner returns not-found and calls no rpc", async () => {
    const r = await changeRegistrationStatus({ registrationId: "b", to: "pending", expectedFrom: "paid", actor: agent("ag1") });
    expect(r).toEqual({ ok: false, reason: "not-found" });
    expect(rpcs()).toHaveLength(0);
  });
  it("change: free row returns free-row", async () => {
    const r = await changeRegistrationStatus({ registrationId: "f", to: "paid", expectedFrom: "free", actor: admin });
    expect(r).toEqual({ ok: false, reason: "free-row" });
  });
  it("change: underpaid without amount returns amount-required and calls no rpc", async () => {
    const r = await changeRegistrationStatus({ registrationId: "a", to: "underpaid", expectedFrom: "pending", actor: admin });
    expect(r).toEqual({ ok: false, reason: "amount-required" });
    expect(rpcs()).toHaveLength(0);
  });
  it("change: passes the caller's expectedFrom (not the freshly read status), amount, actor and source app to the rpc", async () => {
    const r = await changeRegistrationStatus({ registrationId: "a", to: "underpaid", expectedFrom: "pending", amount: 2000, actor: agent("ag1") });
    expect(r).toEqual({ ok: true, id: "a", status: "underpaid", rowsChanged: 2 });
    expect(rpcs()).toHaveLength(1);
    expect(rpcs()[0].table).toBe("landing_apply_status");
    expect(rpcs()[0].payload).toEqual({
      p_registration_id: "a", p_to_status: "underpaid", p_expected_from: "pending", p_amount: 2000, p_actor: "ag1", p_source: "app",
    });
  });
  it("change: paid without an amount passes the expected amount", async () => {
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(rpcs()[0].payload).toMatchObject({ p_amount: 5000, p_to_status: "paid" });
  });
  it("change: expectedFrom that differs from the current status returns stale without a second write", async () => {
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "reserved", actor: admin });
    expect(r).toEqual({ ok: false, reason: "stale" });
    expect(rpcs()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });
  it("change: rpc stale becomes stale", async () => {
    rpcResult = { data: { ok: false, reason: "stale" }, error: null };
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(r).toEqual({ ok: false, reason: "stale" });
  });
  it("change: rpc not-found becomes not-found", async () => {
    rpcResult = { data: { ok: false, reason: "not-found" }, error: null };
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(r).toEqual({ ok: false, reason: "not-found" });
  });
  it("change: rpc error becomes db-error", async () => {
    rpcResult = { data: null, error: { code: "XX000", message: "boom" } };
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(r).toEqual({ ok: false, reason: "db-error" });
  });
  it("change: same status returns already-in-status", async () => {
    const r = await changeRegistrationStatus({ registrationId: "a", to: "pending", expectedFrom: "pending", actor: admin });
    expect(r).toEqual({ ok: false, reason: "already-in-status" });
    expect(rpcs()).toHaveLength(0);
  });
  it("change: an agent with an empty id gets not-found and no rpc", async () => {
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: agent("") });
    expect(r).toEqual({ ok: false, reason: "not-found" });
    expect(rpcs()).toHaveLength(0);
  });
  it("change: rpc free-row and already-in-status are mapped, not db-error", async () => {
    rpcResult = { data: { ok: false, reason: "free-row" }, error: null };
    expect(await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin })).toEqual({ ok: false, reason: "free-row" });
    rpcResult = { data: { ok: false, reason: "already-in-status" }, error: null };
    expect(await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin })).toEqual({ ok: false, reason: "already-in-status" });
  });
  it("change: an unmapped rpc reason becomes db-error and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpcResult = { data: { ok: false, reason: "weird" }, error: null };
    expect(await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin })).toEqual({ ok: false, reason: "db-error" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("weird"));
    warn.mockRestore();
  });
  it("change: an agent cannot change a test row, an admin can", async () => {
    expect((await changeRegistrationStatus({ registrationId: "t", to: "paid", expectedFrom: "pending", actor: agent("ag1") })).ok).toBe(false);
    expect((await changeRegistrationStatus({ registrationId: "t", to: "paid", expectedFrom: "pending", actor: admin })).ok).toBe(true);
  });
  it("change: the read is scoped to the agent's own rows", async () => {
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: agent("ag1") });
    expect(filterValue(regReads()[0], "eq", "agent_id")).toBe("ag1");
  });

  it("change calls enqueueSheetStatus once after success and not on failure", async () => {
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(jobs.enqueueSheetStatus).toHaveBeenCalledTimes(1);
    expect(jobs.enqueueSheetStatus).toHaveBeenCalledWith("a");
    expect(jobs.runInBackground).toHaveBeenCalledTimes(1);
    jobs.enqueueSheetStatus.mockClear();
    rpcResult = { data: { ok: false, reason: "stale" }, error: null };
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    rpcResult = { data: null, error: { code: "XX000" } };
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(jobs.enqueueSheetStatus).not.toHaveBeenCalled();
  });
  it("change falls back to running the job directly when the outbox is unavailable", async () => {
    jobs.enqueueSheetStatus.mockResolvedValue(false);
    await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["sheet_status"]);
  });
  const paid = () => changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
  it("a Paid change enqueues sheet and status effects and runs the jobs once", async () => {
    expect((await paid()).ok).toBe(true);
    expect(jobs.enqueueSheetStatus).toHaveBeenCalledWith("a");
    expect(jobs.enqueueStatusEffects).toHaveBeenCalledWith("a");
    expect(jobs.runJobsFor).toHaveBeenCalledTimes(1);
    expect(jobs.runJobsFor).toHaveBeenCalledWith("a");
    expect(jobs.runJobsDirect).not.toHaveBeenCalled();
  });
  it("sheet enqueue failing runs the sheet job directly plus the other group via the outbox", async () => {
    jobs.enqueueSheetStatus.mockResolvedValue(false);
    await paid();
    expect(jobs.runJobsDirect).toHaveBeenCalledTimes(1);
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["sheet_status"]);
    expect(jobs.runJobsFor).toHaveBeenCalledTimes(1);
  });
  it("status-effects enqueue failing runs enrollment and email directly plus the sheet via the outbox", async () => {
    jobs.enqueueStatusEffects.mockResolvedValue(false);
    await paid();
    expect(jobs.runJobsDirect).toHaveBeenCalledTimes(1);
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["enrollment_sync", "email_status", "meta_purchase"]);
    expect(jobs.runJobsFor).toHaveBeenCalledTimes(1);
  });
  it("both enqueues failing run all three directly and never use the outbox", async () => {
    jobs.enqueueSheetStatus.mockResolvedValue(false);
    jobs.enqueueStatusEffects.mockResolvedValue(false);
    await paid();
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["sheet_status"]);
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["enrollment_sync", "email_status", "meta_purchase"]);
    expect(jobs.runJobsFor).not.toHaveBeenCalled();
  });
  it("an enqueue that throws still returns ok", async () => {
    jobs.enqueueStatusEffects.mockRejectedValue(new Error("boom"));
    expect((await paid()).ok).toBe(true);
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("a", ["enrollment_sync", "email_status", "meta_purchase"]);
  });
  it("a failing sheet call does not fail the status change", async () => {
    jobs.enqueueSheetStatus.mockRejectedValue(new Error("boom"));
    const r = await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin });
    expect(r.ok).toBe(true);
    jobs.enqueueSheetStatus.mockResolvedValue(true);
    jobs.runInBackground.mockImplementation(() => { throw new Error("bg"); });
    expect((await changeRegistrationStatus({ registrationId: "a", to: "paid", expectedFrom: "pending", actor: admin })).ok).toBe(true);
  });
});

describe("filter options", () => {
  it("lists landing pages as id and title", async () => {
    expect(await listRegistrationPageOptions()).toEqual([{ id: "pg1", title: "PPC" }]);
  });
  it("lists only sales agents as id and name", async () => {
    store.profiles = [
      { id: "ag1", full_name: "Agent One", role: "sales_agent" },
      { id: "adm", full_name: "Admin Person", role: "admin" },
    ];
    expect(await listRegistrationAgentOptions()).toEqual([{ id: "ag1", name: "Agent One" }]);
  });
});
