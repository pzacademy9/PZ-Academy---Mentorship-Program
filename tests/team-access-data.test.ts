import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: { profiles: Row[]; team_access: Row[]; writes: { table: string; op: string; values: Row }[]; flipAfterRead: boolean; failSelect: string | null; failUpsert: boolean } = {
  profiles: [], team_access: [], writes: [], flipAfterRead: false, failSelect: null, failUpsert: false,
};

function from(table: "profiles" | "team_access") {
  let filters: [string, unknown][] = [];
  let inFilter: [string, unknown[]] | null = null;
  let pending: { op: "update" | "upsert"; values: Row } | null = null;
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]])));
  const b: Record<string, unknown> = {
    select: () => b,
    in: (k: string, vals: unknown[]) => { inFilter = [k, vals]; return b; },
    order: () => b,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    maybeSingle: async () => {
      if (db.failSelect === table) return { data: null, error: { message: "boom" } };
      const row = rows()[0] ?? null;
      const copy = row ? { ...row } : null;
      if (db.flipAfterRead && row && table === "profiles") row.role = "mentor";
      return { data: copy, error: null };
    },
    update: (values: Row) => { pending = { op: "update", values }; return b; },
    upsert: async (values: Row) => { if (db.failUpsert) return { error: { message: "boom" } }; db.writes.push({ table, op: "upsert", values }); return { error: null }; },
    then: (resolve: (v: unknown) => void) => {
      if (db.failSelect === table && !pending) { resolve({ data: null, error: { message: "boom" } }); return; }
      const matched = rows();
      if (pending?.op === "update") {
        if (matched.length > 0) { db.writes.push({ table, op: "update", values: pending.values }); for (const r of matched) Object.assign(r, pending.values); }
        resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
        return;
      }
      resolve({ data: matched, error: null });
    },
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from, auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@test.dev" } } }) } } }) }));
vi.mock("@/lib/data/mentor-accounts", () => ({ findAccountIdByEmail: async () => null }));

import { cleanCustom, decideTeamChange, isStaffRole } from "@/lib/team/rules";
import { getCustomAccess, listTeam, saveTeamMember, switchOffTeamMember } from "@/lib/data/team-access";

beforeEach(() => { db.profiles = []; db.team_access = []; db.writes = []; db.flipAfterRead = false; db.failSelect = null; db.failUpsert = false; });

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

describe("isStaffRole", () => {
  it("is true for admin, super admin and manager only", () => {
    for (const r of ["admin", "super_admin", "manager"] as const) expect(isStaffRole(r)).toBe(true);
    for (const r of ["student", "mentor", "sales_agent"] as const) expect(isStaffRole(r)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
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

describe("races and read failures", () => {
  it("saveTeamMember writes nothing when the role changed after it was read", async () => {
    db.profiles = [{ id: "u7", role: "student" }];
    db.flipAfterRead = true;
    const r = await saveTeamMember({ userId: "u7", role: "manager", custom: { extra: [], removed: [] } });
    expect(r).toEqual({ ok: false, reason: "db-error" });
    expect(db.writes).toEqual([]);
  });
  it("switchOffTeamMember writes nothing when the role changed after it was read", async () => {
    db.profiles = [{ id: "u8", role: "manager" }];
    db.flipAfterRead = true;
    const r = await switchOffTeamMember("u8");
    expect(r.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });
  it("getCustomAccess throws when the read fails, so a guard cannot treat it as no access rules", async () => {
    db.failSelect = "team_access";
    await expect(getCustomAccess("u9")).rejects.toThrow();
  });
  it("getCustomAccess returns null for a person with no active row", async () => {
    expect(await getCustomAccess("nobody")).toBeNull();
  });
});

describe("listTeam", () => {
  it("throws when the team_access read fails, so the screen cannot show people without their custom areas", async () => {
    db.profiles = [{ id: "u1", role: "manager", full_name: "Mia" }];
    db.failSelect = "team_access";
    await expect(listTeam()).rejects.toThrow();
  });
  it("throws when the profiles read fails, instead of showing an empty team", async () => {
    db.failSelect = "profiles";
    await expect(listTeam()).rejects.toThrow();
  });
  it("tells the screen which role a switched-off person had", async () => {
    db.profiles = [{ id: "u2", role: "student", full_name: "Sam" }];
    db.team_access = [{ user_id: "u2", active: false, previous_role: "admin", extra_areas: ["crm"], removed_areas: [] }];
    const m = (await listTeam()).find((x) => x.id === "u2");
    expect(m).toMatchObject({ active: false, previousRole: "admin", custom: { extra: ["crm"], removed: [] } });
  });
});

describe("switch off fails closed when the memory row cannot be saved", () => {
  it("keeps the person demoted and says the Add back details were not saved", async () => {
    db.profiles = [{ id: "u10", role: "manager" }];
    db.failUpsert = true;
    expect(await switchOffTeamMember("u10")).toEqual({ ok: false, reason: "memory-not-saved" });
    const roleWrites = db.writes.filter((w) => w.table === "profiles").map((w) => w.values);
    expect(roleWrites).toEqual([{ role: "student" }]);
    expect(db.profiles[0].role).toBe("student");
  });
});

describe("listTeam shows no stale Add back row", () => {
  const off = (id: string) => ({ user_id: id, active: false, previous_role: "admin", extra_areas: [], removed_areas: [] });
  it("hides a switched-off person who has since become a mentor", async () => {
    db.profiles = [{ id: "u11", role: "mentor", full_name: "Mo" }];
    db.team_access = [off("u11")];
    expect((await listTeam()).find((x) => x.id === "u11")).toBeUndefined();
  });
  it("lists a person once when they were switched off and later made an admin another way", async () => {
    db.profiles = [{ id: "u12", role: "admin", full_name: "Ad" }];
    db.team_access = [off("u12")];
    const rows = (await listTeam()).filter((x) => x.id === "u12");
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(true);
  });
});
