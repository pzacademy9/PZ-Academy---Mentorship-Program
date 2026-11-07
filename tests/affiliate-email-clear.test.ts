import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown, area: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.area = area;
    return gate.result;
  },
}));
const d = vi.hoisted(() => ({ clear: vi.fn(), list: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/data/affiliate-emails", () => ({ clearAffiliateEmails: d.clear, listAffiliateEmails: d.list }));
vi.mock("@/lib/data/affiliates", () => ({ getAffiliateDetail: d.detail }));

import { DELETE } from "@/app/api/admin/affiliates/emails/route";
import { GET as ONE } from "@/app/api/admin/affiliates/[id]/route";
import { areaForPath } from "@/lib/team/areas";

const del = (qs: string) => DELETE(new Request(`http://x/api/admin/affiliates/emails${qs}`, { method: "DELETE" }) as never);

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  gate.result = { ok: true, user: { id: "u" } };
  d.clear.mockResolvedValue(7);
});

describe("DELETE /api/admin/affiliates/emails", () => {
  it("is in the sales_hub area and refuses others without touching data", async () => {
    expect(areaForPath("/api/admin/affiliates/emails")).toEqual(["sales_hub"]);
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await del("?olderThanDays=90")).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect(d.clear).not.toHaveBeenCalled();
  });
  it("clears one affiliate's history", async () => {
    const res = await del("?affiliateId=11111111-1111-4111-8111-111111111111");
    expect(await res.json()).toEqual({ ok: true, removed: 7 });
    expect(d.clear).toHaveBeenCalledWith({ affiliateId: "11111111-1111-4111-8111-111111111111" });
  });
  it("clears everything older than N days (0 means all)", async () => {
    await del("?olderThanDays=90");
    expect(d.clear).toHaveBeenCalledWith({ olderThanDays: 90 });
    await del("?olderThanDays=0");
    expect(d.clear).toHaveBeenLastCalledWith({ olderThanDays: 0 });
  });
  it("refuses a call that names nothing, or a bad value, so a mistake never wipes everything", async () => {
    expect((await del("")).status).toBe(400);
    expect((await del("?olderThanDays=-1")).status).toBe(400);
    expect((await del("?olderThanDays=abc")).status).toBe(400);
    expect((await del("?affiliateId=not-an-id")).status).toBe(400);
    expect(d.clear).not.toHaveBeenCalled();
  });
  it("answers 500 in plain words when clearing fails", async () => {
    d.clear.mockRejectedValue(new Error("db"));
    const res = await del("?olderThanDays=30");
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/could not clear/i);
  });
});

describe("GET one affiliate includes the email history", () => {
  it("returns the emails", async () => {
    d.detail.mockResolvedValue({ id: "a1", status: "accepted", token: "t", code: "X1" });
    d.list.mockResolvedValue([{ id: "e1", kind: "accepted", toEmail: "t@example.com", status: "failed", error: "boom", createdAt: "2026-11-08T00:00:00Z" }]);
    const j = (await (await ONE(new Request("http://x") as never, { params: Promise.resolve({ id: "a1" }) })).json()) as { emails: { status: string }[] };
    expect(j.emails).toHaveLength(1);
    expect(j.emails[0].status).toBe("failed");
  });
  it("still answers when the history cannot be read", async () => {
    d.detail.mockResolvedValue({ id: "a1", status: "applied", token: null });
    d.list.mockRejectedValue(new Error("no table"));
    const res = await ONE(new Request("http://x") as never, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { emails: unknown[] }).emails).toEqual([]);
  });
});
