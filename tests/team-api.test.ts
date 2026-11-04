import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

let role: string | null = "super_admin";
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: role === "signed-out" ? null : { id: "me" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

const saveTeamMember = vi.fn();
const switchOffTeamMember = vi.fn();
const listTeam = vi.fn();
const inviteOrCheckTeamMember = vi.fn();
const findTeamCandidateId = vi.fn();
vi.mock("@/lib/data/team-access", () => ({
  saveTeamMember: (...a: unknown[]) => saveTeamMember(...a),
  switchOffTeamMember: (...a: unknown[]) => switchOffTeamMember(...a),
  listTeam: (...a: unknown[]) => listTeam(...a),
  inviteOrCheckTeamMember: (...a: unknown[]) => inviteOrCheckTeamMember(...a),
  findTeamCandidateId: (...a: unknown[]) => findTeamCandidateId(...a),
}));

import { requireSuperAdmin } from "@/lib/auth/require-admin";
import { GET, POST, PUT } from "@/app/api/admin/team/route";
import { PATCH, DELETE } from "@/app/api/admin/team/[id]/route";

const req = (body: unknown, method = "POST") =>
  ({ method, json: async () => body, nextUrl: { origin: "http://x" } }) as never;
const ctx = { params: Promise.resolve({ id: "u1" }) };
const good = { email: "pat@test.dev", fullName: "Pat Test", role: "manager", extra: [], removed: [] };

beforeEach(() => {
  role = "super_admin";
  for (const f of [saveTeamMember, switchOffTeamMember, listTeam, inviteOrCheckTeamMember, findTeamCandidateId]) f.mockReset();
});

describe("requireSuperAdmin", () => {
  it("lets a super admin in", async () => {
    expect((await requireSuperAdmin()).ok).toBe(true);
  });
  it.each(["admin", "manager", "sales_agent", "mentor", "student"])("refuses %s with 403", async (r) => {
    role = r;
    const g = await requireSuperAdmin();
    expect(g.ok).toBe(false);
    if (!g.ok) expect((g.response as NextResponse).status).toBe(403);
  });
  it("refuses a signed-out person with 401", async () => {
    role = "signed-out";
    const g = await requireSuperAdmin();
    if (!g.ok) expect((g.response as NextResponse).status).toBe(401);
    else throw new Error("should refuse");
  });
});

describe("team routes: only the super admin", () => {
  it.each(["admin", "manager"])("%s gets 403 from every handler and nothing is written", async (r) => {
    role = r;
    const results = await Promise.all([
      GET(), POST(req(good)), PUT(req(good, "PUT")), PATCH(req(good, "PATCH"), ctx), DELETE(req(null, "DELETE"), ctx),
    ]);
    expect(results.map((x) => x.status)).toEqual([403, 403, 403, 403, 403]);
    expect(saveTeamMember).not.toHaveBeenCalled();
    expect(switchOffTeamMember).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/team/[id]", () => {
  it("rejects an area that does not exist with 400", async () => {
    const res = await PATCH(req({ role: "manager", extra: ["hax"], removed: [] }, "PATCH"), ctx);
    expect(res.status).toBe(400);
    expect(saveTeamMember).not.toHaveBeenCalled();
  });
  it("answers 409 for a super admin", async () => {
    saveTeamMember.mockResolvedValue({ ok: false, reason: "is-super-admin" });
    const res = await PATCH(req({ role: "manager", extra: [], removed: [] }, "PATCH"), ctx);
    expect(res.status).toBe(409);
  });
  it("saves the role and lists", async () => {
    saveTeamMember.mockResolvedValue({ ok: true });
    const res = await PATCH(req({ role: "manager", extra: ["marketing"], removed: ["terms"] }, "PATCH"), ctx);
    expect(res.status).toBe(200);
    expect(saveTeamMember).toHaveBeenCalledWith({ userId: "u1", role: "manager", custom: { extra: ["marketing"], removed: ["terms"] } });
  });
});

describe("DELETE /api/admin/team/[id]", () => {
  it("answers 409 for a super admin", async () => {
    switchOffTeamMember.mockResolvedValue({ ok: false, reason: "is-super-admin" });
    expect((await DELETE(req(null, "DELETE"), ctx)).status).toBe(409);
  });
  it("switches a person off", async () => {
    switchOffTeamMember.mockResolvedValue({ ok: true });
    expect((await DELETE(req(null, "DELETE"), ctx)).status).toBe(200);
  });
});

describe("POST and PUT /api/admin/team (add by email)", () => {
  it("POST returns existing without writing when the email already has an account", async () => {
    inviteOrCheckTeamMember.mockResolvedValue({ status: "existing", email: good.email });
    const res = await POST(req(good));
    expect(await res.json()).toEqual({ status: "existing", email: good.email });
    expect(saveTeamMember).not.toHaveBeenCalled();
  });
  it("POST saves the role for a freshly invited person", async () => {
    inviteOrCheckTeamMember.mockResolvedValue({ status: "invited", email: good.email, userId: "new1" });
    saveTeamMember.mockResolvedValue({ ok: true });
    const res = await POST(req(good));
    expect(res.status).toBe(200);
    expect(saveTeamMember).toHaveBeenCalledWith({ userId: "new1", role: "manager", custom: { extra: [], removed: [] } });
  });
  it("PUT refuses a mentor with a plain message", async () => {
    findTeamCandidateId.mockResolvedValue("m1");
    saveTeamMember.mockResolvedValue({ ok: false, reason: "is-mentor" });
    const res = await PUT(req(good, "PUT"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("That account is a mentor. A mentor cannot also be on the team.");
  });
  it("PUT refuses a sales agent and points to Sales Hub", async () => {
    findTeamCandidateId.mockResolvedValue("s1");
    saveTeamMember.mockResolvedValue({ ok: false, reason: "is-sales-agent" });
    const res = await PUT(req(good, "PUT"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Sales agents are managed in Sales Hub, Team.");
  });
  it("PUT answers 404 when the account no longer exists", async () => {
    findTeamCandidateId.mockResolvedValue(null);
    expect((await PUT(req(good, "PUT"))).status).toBe(404);
  });
});

describe("GET /api/admin/team", () => {
  it("lists the team", async () => {
    listTeam.mockResolvedValue([{ id: "u1" }]);
    const res = await GET();
    expect(await res.json()).toEqual({ members: [{ id: "u1" }] });
  });
});
