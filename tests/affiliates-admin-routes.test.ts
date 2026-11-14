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
const d = vi.hoisted(() => ({
  listAffiliates: vi.fn(),
  getAffiliateDetail: vi.fn(),
  acceptApplication: vi.fn(),
  dropAffiliate: vi.fn(),
  markAffiliateLeft: vi.fn(),
  updateAffiliate: vi.fn(),
  send: vi.fn(),
  ensurePromo: vi.fn(),
  deactivatePromo: vi.fn(),
  listTemplates: vi.fn(),
}));
vi.mock("@/lib/data/affiliate-templates", () => ({ listAffiliateTemplates: d.listTemplates }));
vi.mock("@/lib/data/affiliate-promo", () => ({ ensureAffiliatePromo: d.ensurePromo, deactivateAffiliatePromo: d.deactivatePromo }));
vi.mock("@/lib/data/affiliates", () => ({
  listAffiliates: d.listAffiliates,
  getAffiliateDetail: d.getAffiliateDetail,
  acceptApplication: d.acceptApplication,
  dropAffiliate: d.dropAffiliate,
  markAffiliateLeft: d.markAffiliateLeft,
  updateAffiliate: d.updateAffiliate,
}));
vi.mock("@/lib/brevo-affiliates", () => ({ sendAffiliateEmail: d.send }));

import { GET as LIST } from "@/app/api/admin/affiliates/route";
import { GET as TEMPLATES } from "@/app/api/admin/affiliates/templates/route";
import { GET as ONE, PATCH } from "@/app/api/admin/affiliates/[id]/route";
import { areaForPath } from "@/lib/team/areas";

const ctx = { params: Promise.resolve({ id: "a1" }) };
const patch = (body: unknown) => PATCH(new Request("http://x/api/admin/affiliates/a1", { method: "PATCH", body: JSON.stringify(body) }) as never, ctx);
const row = (over: Record<string, unknown> = {}) => ({ id: "a1", status: "applied", name: "Test Person", email: "t@example.com", code: null, team: null, token: null, ...over });

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  gate.result = { ok: true, user: { id: "u" } };
  d.send.mockResolvedValue({ ok: true });
  d.ensurePromo.mockResolvedValue("ok");
  d.deactivatePromo.mockResolvedValue(undefined);
});

describe("affiliate admin routes: access", () => {
  it("belong to the sales_hub area", () => {
    expect(areaForPath("/api/admin/affiliates")).toEqual(["sales_hub"]);
    expect(areaForPath("/dashboard/admin/affiliates")).toEqual(["sales_hub"]);
  });
  it("refuse a user without sales_hub on every route and touch no data", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await LIST(new Request("http://x/api/admin/affiliates") as never)).status).toBe(403);
    expect((await ONE(new Request("http://x") as never, ctx)).status).toBe(403);
    expect((await patch({ action: "drop", reason: "Not active" })).status).toBe(403);
    expect((await TEMPLATES()).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    Object.entries(d).forEach(([k, f]) => expect(f, k).not.toHaveBeenCalled());
  });
});

describe("GET list", () => {
  it("passes the status filter and the rows carry no token", async () => {
    d.listAffiliates.mockResolvedValue([{ id: "a1", name: "T", status: "applied" }]);
    const res = await LIST(new Request("http://x/api/admin/affiliates?status=applied") as never);
    expect(d.listAffiliates).toHaveBeenCalledWith({ status: "applied" });
    expect(JSON.stringify(await res.json())).not.toContain("token");
  });
  it("ignores an unknown status", async () => {
    d.listAffiliates.mockResolvedValue([]);
    await LIST(new Request("http://x/api/admin/affiliates?status=bogus") as never);
    expect(d.listAffiliates).toHaveBeenCalledWith({});
  });
});

describe("GET one", () => {
  it("gives the private link for an accepted affiliate", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "accepted", code: "TP321", token: "tok123" }));
    const j = (await (await ONE(new Request("http://x") as never, ctx)).json()) as { link: string | null; affiliate: Record<string, unknown> };
    expect(j.link).toMatch(/\/affiliate\/tok123$/);
    expect(j.affiliate.token).toBeUndefined();
  });
  it("gives no link for an applicant, and 404 for an unknown id", async () => {
    d.getAffiliateDetail.mockResolvedValue(row());
    expect(((await (await ONE(new Request("http://x") as never, ctx)).json()) as { link: unknown }).link).toBeNull();
    d.getAffiliateDetail.mockResolvedValue(null);
    expect((await ONE(new Request("http://x") as never, ctx)).status).toBe(404);
  });
});

describe("PATCH accept", () => {
  it("accepts, sends one email with code and link, and says emailSent", async () => {
    d.acceptApplication.mockResolvedValue({ ok: true, code: "TP321", token: "tok", name: "Test Person", email: "t@example.com" });
    const res = await patch({ action: "accept", team: "Blue" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: "TP321", emailSent: true });
    expect(d.send).toHaveBeenCalledTimes(1);
    const sent = d.send.mock.calls[0][0] as { to: string; htmlContent: string };
    expect(sent.to).toBe("t@example.com");
    expect(sent.htmlContent).toContain("TP321");
    expect(sent.htmlContent).toContain("/affiliate/tok");
  });
  it("a failed email never undoes the accept", async () => {
    d.acceptApplication.mockResolvedValue({ ok: true, code: "TP321", token: "tok", name: "T", email: "t@example.com" });
    d.send.mockResolvedValue({ ok: false, error: "Affiliate email is not set up" });
    const res = await patch({ action: "accept" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { emailSent: boolean }).emailSent).toBe(false);
  });
  it("a taken code gives 409 in plain words and sends nothing", async () => {
    d.acceptApplication.mockResolvedValue({ ok: false, reason: "code-taken" });
    const res = await patch({ action: "accept", code: "TP321" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already taken/i);
    expect(d.send).not.toHaveBeenCalled();
  });
  it("accepting twice: the second gives 409 and only one email was sent", async () => {
    d.acceptApplication
      .mockResolvedValueOnce({ ok: true, code: "TP321", token: "t", name: "T", email: "t@example.com" })
      .mockResolvedValueOnce({ ok: false, reason: "not-applied" });
    expect((await patch({ action: "accept" })).status).toBe(200);
    expect((await patch({ action: "accept" })).status).toBe(409);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["invalid-code", 400],
    ["invalid-team", 400],
    ["not-found", 404],
    ["db-error", 500],
  ])("%s gives %s", async (reason, status) => {
    d.acceptApplication.mockResolvedValue({ ok: false, reason });
    expect((await patch({ action: "accept" })).status).toBe(status);
  });
  it("an unknown action or bad shape gives 400", async () => {
    expect((await patch({ action: "explode" })).status).toBe(400);
    expect((await patch({ action: "accept", team: "Purple" })).status).toBe(400);
    expect((await patch(null)).status).toBe(400);
  });
});

describe("the discount code follows the affiliate", () => {
  it("accepting makes the code work and says nothing extra when it did", async () => {
    d.acceptApplication.mockResolvedValue({ ok: true, code: "TP321", token: "tok", name: "T", email: "t@example.com" });
    const res = await patch({ action: "accept" });
    expect(d.ensurePromo).toHaveBeenCalledWith({ id: "a1", code: "TP321" });
    expect(await res.json()).toEqual({ ok: true, code: "TP321", emailSent: true });
  });
  it("a failed code never undoes the accept and is flagged for a retry", async () => {
    d.acceptApplication.mockResolvedValue({ ok: true, code: "TP321", token: "tok", name: "T", email: "t@example.com" });
    d.ensurePromo.mockResolvedValue("failed");
    const res = await patch({ action: "accept" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: "TP321", emailSent: true, promoFailed: true });
  });
  it("a code that could not be accepted makes no discount code", async () => {
    d.acceptApplication.mockResolvedValue({ ok: false, reason: "not-applied" });
    await patch({ action: "accept" });
    expect(d.ensurePromo).not.toHaveBeenCalled();
  });
  it("resend repairs the code of an accepted affiliate and flags a failure", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "accepted", code: "TP321", token: "tok", team: "Blue" }));
    expect(await (await patch({ action: "resend" })).json()).toEqual({ ok: true, emailSent: true });
    expect(d.ensurePromo).toHaveBeenCalledWith({ id: "a1", code: "TP321" });
    d.ensurePromo.mockResolvedValue("failed");
    expect(await (await patch({ action: "resend" })).json()).toEqual({ ok: true, emailSent: true, promoFailed: true });
  });
  it("resend for a dropped affiliate does not touch the code", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "dropped" }));
    await patch({ action: "resend" });
    expect(d.ensurePromo).not.toHaveBeenCalled();
  });
  it("drop and leave switch the code off, but only when the change went through", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "accepted" }));
    d.dropAffiliate.mockResolvedValue({ ok: true });
    await patch({ action: "drop", reason: "Not active" });
    expect(d.deactivatePromo).toHaveBeenCalledWith("a1");
    d.deactivatePromo.mockClear();
    d.markAffiliateLeft.mockResolvedValue({ ok: true });
    await patch({ action: "leave" });
    expect(d.deactivatePromo).toHaveBeenCalledWith("a1");
    d.deactivatePromo.mockClear();
    d.dropAffiliate.mockResolvedValue({ ok: false, reason: "wrong-status" });
    await patch({ action: "drop", reason: "Not active" });
    expect(d.deactivatePromo).not.toHaveBeenCalled();
  });
});

describe("GET templates", () => {
  it("returns whatsapp and email lists", async () => {
    const wa = { id: "w", channel: "whatsapp", name: "W", subject: null, body: "b" };
    const em = { id: "e", channel: "email", name: "E", subject: "s", body: "b" };
    d.listTemplates.mockImplementation(async (c: string) => (c === "whatsapp" ? [wa] : [em]));
    const res = await TEMPLATES();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ whatsapp: [wa], email: [em] });
    expect(gate.area).toBe("sales_hub");
  });
  it("gives 500 in plain words when loading fails", async () => {
    d.listTemplates.mockRejectedValue(new Error("x"));
    expect((await TEMPLATES()).status).toBe(500);
  });
});

describe("PATCH drop reason", () => {
  it.each([[undefined], ["  "], ["x".repeat(501)]])("drop with reason %j gives 400 and changes nothing", async (reason) => {
    d.getAffiliateDetail.mockResolvedValue(row());
    const res = await patch({ action: "drop", reason });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Please give a reason for dropping.");
    expect(d.dropAffiliate).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });
  it("passes the trimmed reason to the data layer", async () => {
    d.getAffiliateDetail.mockResolvedValue(row());
    d.dropAffiliate.mockResolvedValue({ ok: true });
    expect((await patch({ action: "drop", reason: "  Never posted  " })).status).toBe(200);
    expect(d.dropAffiliate).toHaveBeenCalledWith("a1", "Never posted");
  });
});

describe("PATCH drop / leave / resend / update", () => {
  it("drop sends the dropped email", async () => {
    d.getAffiliateDetail.mockResolvedValue(row());
    d.dropAffiliate.mockResolvedValue({ ok: true });
    const res = await patch({ action: "drop", reason: "Not active" });
    expect(await res.json()).toEqual({ ok: true, emailSent: true });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("drop on a wrong status gives 409 and sends nothing", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "left" }));
    d.dropAffiliate.mockResolvedValue({ ok: false, reason: "wrong-status" });
    expect((await patch({ action: "drop", reason: "Not active" })).status).toBe(409);
    expect(d.send).not.toHaveBeenCalled();
  });
  it("leave marks left and sends the left email", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "accepted" }));
    d.markAffiliateLeft.mockResolvedValue({ ok: true });
    expect((await patch({ action: "leave" })).status).toBe(200);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("resend sends the accepted email again for an accepted affiliate only", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "accepted", code: "TP321", token: "tok", team: "Blue" }));
    const res = await patch({ action: "resend" });
    expect(await res.json()).toEqual({ ok: true, emailSent: true });
    d.getAffiliateDetail.mockResolvedValue(row());
    expect((await patch({ action: "resend" })).status).toBe(409);
  });
  it("resend after a dropped or left email failed sends that email again", async () => {
    d.getAffiliateDetail.mockResolvedValue(row({ status: "dropped" }));
    expect(await (await patch({ action: "resend" })).json()).toEqual({ ok: true, emailSent: true });
    d.getAffiliateDetail.mockResolvedValue(row({ status: "left" }));
    expect((await patch({ action: "resend" })).status).toBe(200);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect((d.send.mock.calls[0][0] as { subject: string }).subject).toMatch(/affiliate status/i);
  });
  it("update passes team and commission to the data layer", async () => {
    d.updateAffiliate.mockResolvedValue({ ok: true });
    const res = await patch({ action: "update", team: "Pink", commissionMode: "manual", manualPercent: 9 });
    expect(res.status).toBe(200);
    expect(d.updateAffiliate).toHaveBeenCalledWith("a1", { team: "Pink", commissionMode: "manual", manualPercent: 9 });
  });
  it("update with a bad percent gives 400 in plain words", async () => {
    d.updateAffiliate.mockResolvedValue({ ok: false, reason: "invalid-percent" });
    const res = await patch({ action: "update", commissionMode: "manual", manualPercent: 12 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/8 and 10/);
  });
});
