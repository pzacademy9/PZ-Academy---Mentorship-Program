import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const requireSalesAgent = vi.fn();
vi.mock("@/lib/auth/require-sales", () => ({ requireSalesAgent: () => requireSalesAgent() }));

const data = vi.hoisted(() => ({
  loadCampaignAudience: vi.fn(),
  createCampaign: vi.fn(),
  listMyCampaigns: vi.fn(),
  getMyCampaign: vi.fn(),
  sendCampaignRecipient: vi.fn(),
  skipCampaignRecipient: vi.fn(),
  setCampaignStatus: vi.fn(),
}));
vi.mock("@/lib/data/sales-campaigns", () => data);

import { GET as audienceGET } from "@/app/api/sales/campaigns/audience/route";
import { GET as listGET, POST as createPOST } from "@/app/api/sales/campaigns/route";
import { GET as detailGET, PATCH as detailPATCH } from "@/app/api/sales/campaigns/[id]/route";
import { POST as sendPOST } from "@/app/api/sales/campaigns/[id]/send/route";
import { POST as skipPOST } from "@/app/api/sales/campaigns/[id]/skip/route";
import { VARIETY_MESSAGE } from "@/lib/crm/campaign-rules";

const uid = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: uid }) };
const body = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
const create = { messageTemplate: "Hi", contactIds: [uid], numberId: uid };

beforeEach(() => {
  vi.clearAllMocks();
  requireSalesAgent.mockResolvedValue({ ok: true, user: { id: "agent-1" }, role: "sales_agent" });
});

describe("campaign routes auth", () => {
  for (const status of [401, 403]) {
    it(`every route returns ${status} without an agent and touches no data`, async () => {
      requireSalesAgent.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "no" }, { status }) });
      const rs = [
        await audienceGET(),
        await listGET(),
        await createPOST(body(create)),
        await detailGET(new Request("http://x"), ctx),
        await detailPATCH(body({ status: "paused" }), ctx),
        await sendPOST(body({ recipientId: uid }), ctx),
        await skipPOST(body({ recipientId: uid }), ctx),
      ];
      expect(rs.map((r) => r.status)).toEqual(Array(7).fill(status));
      for (const fn of Object.values(data)) expect(fn).not.toHaveBeenCalled();
    });
  }
});

describe("campaign routes reject a non-uuid id with 404 before touching data", () => {
  const bad = { params: Promise.resolve({ id: "not-a-uuid" }) };
  it("GET / PATCH / send / skip", async () => {
    const rs = [
      await detailGET(new Request("http://x"), bad),
      await detailPATCH(body({ status: "paused" }), bad),
      await sendPOST(body({ recipientId: uid }), bad),
      await skipPOST(body({ recipientId: uid }), bad),
    ];
    expect(rs.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    for (const r of rs) expect(await r.json()).toEqual({ error: "Campaign not found." });
    for (const fn of Object.values(data)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("campaign routes behaviour", () => {
  it("GET detail returns 404 with no data for another agent's campaign", async () => {
    data.getMyCampaign.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await detailGET(new Request("http://x"), ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.campaign).toBeUndefined();
    expect(Object.keys(json)).toEqual(["error"]);
    expect(data.getMyCampaign).toHaveBeenCalledWith({ id: "agent-1", role: "sales_agent" }, uid);
  });

  it("POST create maps variety to 400 with VARIETY_MESSAGE", async () => {
    data.createCampaign.mockResolvedValue({ ok: false, reason: "variety" });
    const res = await createPOST(body(create));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(VARIETY_MESSAGE);
  });

  it("POST create success returns 201 with dropped text", async () => {
    data.createCampaign.mockResolvedValue({
      ok: true,
      campaignId: "c1",
      recipientCount: 3,
      dropped: { notOwned: 1, doNotContact: 0, noPhone: 0, duplicates: 0 },
    });
    const res = await createPOST(body(create));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.campaignId).toBe("c1");
    expect(json.recipientCount).toBe(3);
    expect(json.droppedText.length).toBeGreaterThan(0);
  });

  it("POST create rejects an invalid body with 400", async () => {
    const res = await createPOST(body({ ...create, contactIds: [] }));
    expect(res.status).toBe(400);
    expect(data.createCampaign).not.toHaveBeenCalled();
  });

  it("send failure has the full body shape and statusForReason status", async () => {
    data.sendCampaignRecipient.mockResolvedValue({
      ok: false,
      reason: "daily_cap",
      message: "Daily limit reached",
      retryAt: "2026-10-09T05:00:00Z",
      paused: true,
      recipientBlocked: false,
      pendingCount: 12,
    });
    const res = await sendPOST(body({ recipientId: uid }), ctx);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Daily limit reached",
      reason: "daily_cap",
      retryAt: "2026-10-09T05:00:00Z",
      paused: true,
      recipientBlocked: false,
      pendingCount: 12,
    });
  });

  it("send failure defaults missing fields and blocked recipients stay non-2xx", async () => {
    data.sendCampaignRecipient.mockResolvedValue({ ok: false, reason: "no-phone", recipientBlocked: true });
    const res = await sendPOST(body({ recipientId: uid }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Could not send this message.",
      reason: "no-phone",
      retryAt: null,
      paused: false,
      recipientBlocked: true,
      pendingCount: null,
    });
  });

  it("error responses never leak another agent's data", async () => {
    data.sendCampaignRecipient.mockResolvedValue({ ok: false, reason: "not-found" });
    data.skipCampaignRecipient.mockResolvedValue({ ok: false, reason: "not-found" });
    data.setCampaignStatus.mockResolvedValue({ ok: false, reason: "not-found" });
    const rs = [
      await sendPOST(body({ recipientId: uid }), ctx),
      await skipPOST(body({ recipientId: uid }), ctx),
      await detailPATCH(body({ status: "paused" }), ctx),
    ];
    for (const r of rs) {
      expect(r.status).toBe(404);
      const j = await r.json();
      expect(j.link).toBeUndefined();
      expect(j.campaign).toBeUndefined();
      expect(j.pendingCount ?? null).toBeNull();
    }
  });

  it("skip and patch success shapes", async () => {
    data.skipCampaignRecipient.mockResolvedValue({ ok: true, pendingCount: 4, done: false });
    data.setCampaignStatus.mockResolvedValue({ ok: true, status: "paused" });
    expect(await (await skipPOST(body({ recipientId: uid }), ctx)).json()).toEqual({ pendingCount: 4, done: false });
    expect(await (await detailPATCH(body({ status: "paused" }), ctx)).json()).toEqual({ status: "paused" });
  });
});
