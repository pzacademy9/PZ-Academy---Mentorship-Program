import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let access: () => Promise<unknown> = async () => null;
const getCustomAccess = vi.fn((..._a: unknown[]) => access());
vi.mock("@/lib/data/team-access", () => ({ getCustomAccess: (id: string) => getCustomAccess(id) }));

import { areasForRole } from "@/lib/auth/viewer-areas";
import { effectiveAreas } from "@/lib/team/areas";

beforeEach(() => {
  getCustomAccess.mockClear();
  access = async () => null;
});

describe("areasForRole", () => {
  it.each(["super_admin", "student", "mentor", "sales_agent"] as const)("gives undefined for %s", async (role) => {
    expect(await areasForRole(role, "u1")).toBeUndefined();
    expect(getCustomAccess).not.toHaveBeenCalled();
  });
  it.each(["admin", "manager"] as const)("gives the effective areas for %s", async (role) => {
    const custom = { areas: ["students"] };
    access = async () => custom;
    expect(await areasForRole(role, "u1")).toEqual(effectiveAreas(role, custom as never));
  });
  it("gives no areas when custom access cannot be read", async () => {
    access = async () => { throw new Error("boom"); };
    expect(await areasForRole("manager", "u1")).toEqual([]);
  });
});
