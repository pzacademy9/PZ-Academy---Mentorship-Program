// tests/landing-registration-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const sheet = vi.hoisted(() => ({ deleteRegistrationRows: vi.fn() }));
vi.mock("@/lib/gas/event-sheet-client", () => sheet);

import { deleteRegistration } from "@/lib/data/landing-registration-delete";

type Rows = Record<string, Record<string, unknown>[]>;
/** Answers selects from `rows` (by id / lead / student filters); anything in `over` wins; writes succeed. */
function script(rows: Rows, over: Partial<Record<string, Res>> = {}) {
  db.state.handler = (op: Op): Res => {
    const key = `${op.table}:${op.op}`;
    if (over[key]) return over[key] as Res;
    if (op.op === "select") {
      let hit = rows[op.table] ?? [];
      for (const [col, kind] of [["id", "eq"], ["lead_registration_id", "eq"], ["student_id", "eq"], ["course_id", "eq"]] as const) {
        const v = filterValue(op, kind, col);
        if (v !== undefined) hit = hit.filter((r) => r[col] === v);
      }
      const landing = filterValue(op, "in", "landing_registration_id") as string[] | undefined;
      if (landing) hit = hit.filter((r) => landing.includes(r.landing_registration_id as string));
      const regIds = filterValue(op, "in", "registration_id") as string[] | undefined;
      if (regIds) hit = hit.filter((r) => regIds.includes(r.registration_id as string));
      return { data: op.single ? hit[0] ?? null : hit, error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  db.reset();
  sheet.deleteRegistrationRows.mockReset().mockResolvedValue({ ok: true, deleted: 0, missing: [] });
});

const lead = { id: "lead-1", row_type: "lead", page_id: "p1", ref_id: "PZA-1", email: "lead@x.com", is_test: false };
const members = [
  { id: "m1", lead_registration_id: "lead-1", email: "m1@x.com" },
  { id: "m2", lead_registration_id: "lead-1", email: "m2@x.com" },
];
const page = { id: "p1", sheet_id: "sheet-1" };
const enrollment = { id: "e1", student_id: "s1", course_id: "c1", landing_registration_id: "lead-1" };
const writes = () => db.state.ops.filter((o) => o.op === "delete" || o.op === "update");

describe("deleteRegistration", () => {
  it("removes the course access it gave, then the registration (members go with it)", async () => {
    script({ landing_registrations: [lead, ...members], enrollments: [enrollment], landing_pages: [page] });
    const r = await deleteRegistration({ registrationId: "lead-1" });
    expect(r).toEqual({ ok: true, removedMembers: 2 });
    const del = db.state.ops.filter((o) => o.op === "delete");
    expect(del.map((o) => o.table)).toEqual(["enrollments", "landing_registrations"]);
    expect(filterValue(del[0], "in", "id")).toEqual(["e1"]);
    expect(filterValue(del[1], "eq", "id")).toBe("lead-1");
  });
  it("lets go of old sheet-lead links to the enrollment before deleting it", async () => {
    script({ landing_registrations: [lead], enrollments: [enrollment] });
    await deleteRegistration({ registrationId: "lead-1" });
    const order = writes().map((o) => `${o.op}:${o.table}`);
    expect(order).toEqual(["update:sheet_leads", "delete:enrollments", "delete:landing_registrations"]);
    expect(db.state.ops.find((o) => o.table === "sheet_leads")?.payload).toEqual({ resolved_enrollment_id: null });
  });
  it("keeps the course access when the student has another paid registration for the same course", async () => {
    script({
      landing_registrations: [lead, { id: "other-1", page_id: "p2", student_id: "s1", status: "paid", is_test: false }],
      enrollments: [enrollment],
      landing_pages: [{ id: "p2", course_id: "c1" }],
    });
    const r = await deleteRegistration({ registrationId: "lead-1" });
    expect(r.ok).toBe(true);
    const upd = db.state.ops.find((o) => o.table === "enrollments" && o.op === "update");
    expect(upd?.payload).toEqual({ landing_registration_id: "other-1" });
    expect(db.state.ops.some((o) => o.table === "enrollments" && o.op === "delete")).toBe(false);
  });
  it("a paid registration for a different course does not keep the access", async () => {
    script({
      landing_registrations: [lead, { id: "other-1", page_id: "p9", student_id: "s1", status: "paid", is_test: false }],
      enrollments: [enrollment],
      landing_pages: [{ id: "p9", course_id: "c-other" }],
    });
    await deleteRegistration({ registrationId: "lead-1" });
    expect(db.state.ops.some((o) => o.table === "enrollments" && o.op === "delete")).toBe(true);
  });
  it("deletes the sheet rows first: the lead and each member, found by the lead's Ref ID and the email the sheet shows", async () => {
    script({
      landing_registrations: [lead, ...members], landing_pages: [page],
      landing_sheet_snapshots: [{ registration_id: "m1", email: "old-m1@x.com" }],
    });
    let deletesBeforeSheet = -1;
    sheet.deleteRegistrationRows.mockImplementation(async () => {
      deletesBeforeSheet = db.state.ops.filter((o) => o.op === "delete").length;
      return { ok: true, deleted: 3, missing: [] };
    });
    await deleteRegistration({ registrationId: "lead-1" });
    expect(deletesBeforeSheet).toBe(0);
    expect(sheet.deleteRegistrationRows).toHaveBeenCalledWith("sheet-1", [
      { refId: "PZA-1", email: "lead@x.com" },
      { refId: "PZA-1", email: "old-m1@x.com" },
      { refId: "PZA-1", email: "m2@x.com" },
    ]);
  });
  it("leaves the sheet alone for a test row or a page with no sheet", async () => {
    script({ landing_registrations: [{ ...lead, is_test: true }], landing_pages: [page] });
    await deleteRegistration({ registrationId: "lead-1" });
    script({ landing_registrations: [lead], landing_pages: [{ id: "p1", sheet_id: null }] });
    await deleteRegistration({ registrationId: "lead-1" });
    expect(sheet.deleteRegistrationRows).not.toHaveBeenCalled();
  });
  it("deletes nothing when the sheet cannot be reached, so the app and the sheet never disagree", async () => {
    sheet.deleteRegistrationRows.mockResolvedValue({ ok: false, deleted: 0, missing: [], message: "Apps Script timed out." });
    script({ landing_registrations: [lead], landing_pages: [page], enrollments: [enrollment] });
    expect(await deleteRegistration({ registrationId: "lead-1" })).toEqual({ ok: false, reason: "sheet-error" });
    expect(writes()).toHaveLength(0);
  });
  it("refuses a group member (its group's main registration owns it)", async () => {
    script({ landing_registrations: [{ id: "m1", row_type: "member", page_id: "p1", lead_registration_id: "lead-1" }] });
    expect(await deleteRegistration({ registrationId: "m1" })).toEqual({ ok: false, reason: "member-row" });
    expect(writes()).toHaveLength(0);
  });
  it("answers not-found for an id that does not exist", async () => {
    script({ landing_registrations: [] });
    expect(await deleteRegistration({ registrationId: "nope" })).toEqual({ ok: false, reason: "not-found" });
  });
  it("deletes nothing more when the access removal fails", async () => {
    script({ landing_registrations: [lead], enrollments: [enrollment] }, { "enrollments:delete": { data: null, error: { code: "23503" } } });
    expect(await deleteRegistration({ registrationId: "lead-1" })).toEqual({ ok: false, reason: "db-error" });
    expect(db.state.ops.filter((o) => o.op === "delete").map((o) => o.table)).toEqual(["enrollments"]);
  });
  it("can be run again after the registration step failed (the access is already gone)", async () => {
    script({ landing_registrations: [lead], enrollments: [] }, { "landing_registrations:delete": { data: null, error: { code: "XX000" } } });
    expect(await deleteRegistration({ registrationId: "lead-1" })).toEqual({ ok: false, reason: "db-error" });
    script({ landing_registrations: [lead], enrollments: [] });
    expect((await deleteRegistration({ registrationId: "lead-1" })).ok).toBe(true);
  });
});
