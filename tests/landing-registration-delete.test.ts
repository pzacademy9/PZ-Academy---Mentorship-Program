// tests/landing-registration-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { deleteRegistration } from "@/lib/data/landing-registration-delete";

type Rows = Record<string, Record<string, unknown>[]>;
function script(rows: Rows, over: Partial<Record<string, Res>> = {}) {
  db.state.handler = (op: Op): Res => {
    const key = `${op.table}:${op.op}`;
    if (over[key]) return over[key] as Res;
    if (op.op === "select") {
      const all = rows[op.table] ?? [];
      const eqId = filterValue(op, "eq", "id");
      const lead = filterValue(op, "eq", "lead_registration_id");
      const hit = all.filter((r) => (eqId === undefined || r.id === eqId) && (lead === undefined || r.lead_registration_id === lead));
      return { data: op.single ? hit[0] ?? null : hit, error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => db.reset());

const lead = { id: "lead-1", row_type: "lead", page_id: "p1" };
const members = [{ id: "m1", lead_registration_id: "lead-1" }, { id: "m2", lead_registration_id: "lead-1" }];

describe("deleteRegistration", () => {
  it("removes the course access it gave, then the registration (members go with it)", async () => {
    script({ landing_registrations: [lead, ...members] });
    const r = await deleteRegistration({ registrationId: "lead-1" });
    expect(r).toEqual({ ok: true, removedMembers: 2 });
    const del = db.state.ops.filter((o) => o.op === "delete");
    expect(del.map((o) => o.table)).toEqual(["enrollments", "landing_registrations"]);
    expect(filterValue(del[0], "in", "landing_registration_id")).toEqual(["lead-1", "m1", "m2"]);
    expect(filterValue(del[1], "eq", "id")).toBe("lead-1");
  });
  it("refuses a group member (its group's main registration owns it)", async () => {
    script({ landing_registrations: [{ id: "m1", row_type: "member", page_id: "p1", lead_registration_id: "lead-1" }] });
    expect(await deleteRegistration({ registrationId: "m1" })).toEqual({ ok: false, reason: "member-row" });
    expect(db.state.ops.some((o) => o.op === "delete")).toBe(false);
  });
  it("answers not-found for an id that does not exist", async () => {
    script({ landing_registrations: [] });
    expect(await deleteRegistration({ registrationId: "nope" })).toEqual({ ok: false, reason: "not-found" });
  });
  it("refuses a row that a mirrored sheet owns, so it would only come back", async () => {
    script({ landing_registrations: [lead], landing_mirror_rows: [{ registration_id: "lead-1" }] });
    expect(await deleteRegistration({ registrationId: "lead-1" })).toEqual({ ok: false, reason: "mirrored" });
    expect(db.state.ops.some((o) => o.op === "delete")).toBe(false);
  });
  it("deletes nothing more when the access removal fails", async () => {
    script({ landing_registrations: [lead] }, { "enrollments:delete": { data: null, error: { code: "23503" } } });
    expect(await deleteRegistration({ registrationId: "lead-1" })).toEqual({ ok: false, reason: "db-error" });
    expect(db.state.ops.filter((o) => o.op === "delete").map((o) => o.table)).toEqual(["enrollments"]);
  });
});
