import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: { profiles: Row[]; team_access: Row[]; writes: { table: string; op: string; values: Row }[] } = {
  profiles: [], team_access: [], writes: [],
};

function from(table: "profiles" | "team_access") {
  let filters: [string, unknown][] = [];
  let pending: { op: "update" | "upsert"; values: Row } | null = null;
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    update: (values: Row) => { pending = { op: "update", values }; return b; },
    upsert: async (values: Row) => { db.writes.push({ table, op: "upsert", values }); return { error: null }; },
    then: (resolve: (v: unknown) => void) => {
      if (pending) db.writes.push({ table, op: pending.op, values: pending.values });
      resolve({ data: pending ? [{ id: "x" }] : rows(), error: null });
    },
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from, auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@test.dev" } } }) } } }) }));
vi.mock("@/lib/data/mentor-accounts", () => ({ findAccountIdByEmail: async () => null }));

import { cleanCustom, decideTeamChange } from "@/lib/team/rules";
import { saveTeamMember, switchOffTeamMember } from "@/lib/data/team-access";

beforeEach(() => { db.profiles = []; db.team_access = []; db.writes = []; });

describe("decideTeamChange", () => {
  it("allows admin, manager and plain students, refuses everyone else", () => {
    expect(decideTeamChange("admin")).toBe("ok");
    expect(decideTeamChange("manager")).toBe("ok");
    expect(decideTeamChange("student")).toBe("ok");
    expect(decideTeamChange("super_admin")).toBe("is-super-admin");
    expect(decideTeamChange("mentor")).toBe("is-mentor");
    expect(decideTeamChange("sales_agent")).toBe("is-sales-agent");
    expect(decideTeamChange(null)).toBe("not-found");
  });
});

describe("cleanCustom", () => {
  it("strips team and duplicates, and when an area is in both lists the removal wins", () => {
    expect(cleanCustom({ extra: ["team", "marketing", "marketing", "crm"], removed: ["marketing", "terms"] })).toEqual({
      extra: ["crm"], removed: ["marketing", "terms"],
    });
  });
});

describe("saveTeamMember", () => {
  it("refuses a super admin and writes nothing", async () => {
    db.profiles = [{ id: "u1", role: "super_admin" }];
    const r = await saveTeamMember({ userId: "u1", role: "manager", custom: { extra: [], removed: [] } });
    expect(r).toEqual({ ok: false, reason: "is-super-admin" });
    expect(db.writes).toEqual([]);
  });
  it("refuses a mentor", async () => {
    db.profiles = [{ id: "u2", role: "mentor" }];
    expect(await saveTeamMember({ userId: "u2", role: "admin", custom: { extra: [], removed: [] } })).toEqual({ ok: false, reason: "is-mentor" });
  });
  it("stores the cleaned lists, never team, and marks the person active", async () => {
    db.profiles = [{ id: "u3", role: "student" }];
    const r = await saveTeamMember({ userId: "u3", role: "manager", custom: { extra: ["team", "marketing"], removed: [] } });
    expect(r).toEqual({ ok: true });
    const up = db.writes.find((w) => w.table === "team_access");
    expect(up?.values).toMatchObject({ user_id: "u3", extra_areas: ["marketing"], removed_areas: [], active: true, previous_role: null });
    expect(db.writes.find((w) => w.table === "profiles")?.values).toEqual({ role: "manager" });
  });
});

describe("switchOffTeamMember", () => {
  it("makes the person a student, keeps their lists and remembers the old role", async () => {
    db.profiles = [{ id: "u4", role: "manager" }];
    db.team_access = [{ user_id: "u4", extra_areas: ["marketing"], removed_areas: [], active: true }];
    expect(await switchOffTeamMember("u4")).toEqual({ ok: true });
    expect(db.writes.find((w) => w.table === "profiles")?.values).toEqual({ role: "student" });
    expect(db.writes.find((w) => w.table === "team_access")?.values).toMatchObject({ user_id: "u4", active: false, previous_role: "manager" });
    expect(db.writes.find((w) => w.table === "team_access")?.values).not.toHaveProperty("extra_areas");
  });
  it("refuses a super admin", async () => {
    db.profiles = [{ id: "u5", role: "super_admin" }];
    expect(await switchOffTeamMember("u5")).toEqual({ ok: false, reason: "is-super-admin" });
    expect(db.writes).toEqual([]);
  });
  it("refuses someone who is not on the team", async () => {
    db.profiles = [{ id: "u6", role: "student" }];
    expect(await switchOffTeamMember("u6")).toEqual({ ok: false, reason: "not-team-member" });
  });
});
