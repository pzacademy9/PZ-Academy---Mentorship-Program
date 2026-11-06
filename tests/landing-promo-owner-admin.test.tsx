import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
const data = vi.hoisted(() => ({ getPromoSettings: vi.fn(), setPromoSettings: vi.fn() }));
vi.mock("@/lib/data/landing-promo-codes", () => ({ getPromoSettings: data.getPromoSettings, setPromoSettings: data.setPromoSettings }));

import { GET as getSettings, PATCH as patchSettings } from "@/app/api/admin/landing-promo-settings/route";
import { PromoCodesManager } from "@/components/admin/landing/promo/PromoCodesManager";
import { promoCreateSchema, promoIssues } from "@/lib/validations/landing-promo";
import { draftFromPromo, draftToInput, emptyPromoDraft, type PromoDraft } from "@/lib/landing/registration/promo-form";
import type { PromoCode } from "@/lib/landing/registration/promo";

const AGENT = "00000000-0000-4000-8000-0000000000a1";
const create = (over: Record<string, unknown> = {}) => ({
  code: "ALI-1", type: "percent", value: 0, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [], maxUses: null,
  oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: AGENT, isOwnerCode: true, plainPercent: 10, maxPercent: null, ...over,
});
const ownerDraft = (over: Partial<PromoDraft> = {}): PromoDraft => ({ ...emptyPromoDraft(), code: "ALI-1", isOwnerCode: true, ownerAgentId: AGENT, ...over });

describe("owner code rules", () => {
  it("accepts an owner code with no percent-off value of its own", () => {
    expect(promoCreateSchema.safeParse(create()).success).toBe(true);
    expect(promoIssues({ type: "percent", value: 0, isOwnerCode: true })).toEqual([]);
    expect(promoIssues({ type: "percent", value: 0 }).length).toBe(1);
  });
  it("needs an owner, a plain percent of 0 to 100 and an own maximum of 1 to 100", () => {
    const bad = (o: Record<string, unknown>) => promoCreateSchema.safeParse(create(o));
    expect(bad({ ownerAgentId: null }).success).toBe(false);
    expect(bad({ plainPercent: 101 }).success).toBe(false);
    expect(bad({ plainPercent: 0 }).success).toBe(true);
    expect(bad({ maxPercent: 0 }).success).toBe(false);
    expect(bad({ maxPercent: 20 }).success).toBe(true);
  });
});

describe("owner code form data", () => {
  it("builds an owner input from the draft", () => {
    const r = draftToInput(ownerDraft({ plainPercent: "10", ownPercentMax: "20" }));
    expect(r.ok && r.input).toMatchObject({ code: "ALI-1", isOwnerCode: true, ownerAgentId: AGENT, plainPercent: 10, maxPercent: 20, type: "percent", value: 0 });
  });
  it("defaults the plain percent to 10 and the own maximum to none", () => {
    const r = draftToInput(ownerDraft());
    expect(r.ok && r.input).toMatchObject({ plainPercent: 10, maxPercent: null });
  });
  it("allows a plain percent of 0 and refuses 101, a missing owner and a bad own maximum", () => {
    expect(draftToInput(ownerDraft({ plainPercent: "0" })).ok).toBe(true);
    const r = draftToInput(ownerDraft({ plainPercent: "101", ownerAgentId: "", ownPercentMax: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["ownPercentMax", "ownerAgentId", "plainPercent"]);
  });
  it("round-trips a stored owner code", () => {
    const p = { id: "x", code: "ALI-1", type: "percent", value: 0, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [], maxUses: null, usedCount: 0,
      oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: AGENT, isOwnerCode: true, plainPercent: 0, maxPercent: 15 } as PromoCode;
    expect(draftFromPromo(p)).toMatchObject({ isOwnerCode: true, ownerAgentId: AGENT, plainPercent: "0", ownPercentMax: "15" });
  });
});

describe("/api/admin/landing-promo-settings", () => {
  beforeEach(() => { gate.ok = true; data.getPromoSettings.mockReset(); data.setPromoSettings.mockReset(); });
  const req = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never;
  it("answers the gate's 403 and touches no data", async () => {
    gate.ok = false;
    expect((await getSettings()).status).toBe(403);
    expect((await patchSettings(req({ maxPercent: 25 }))).status).toBe(403);
    expect(data.getPromoSettings).not.toHaveBeenCalled();
    expect(data.setPromoSettings).not.toHaveBeenCalled();
  });
  it("reads and saves the ceiling, refusing 0 and 101 and non-whole numbers", async () => {
    data.getPromoSettings.mockResolvedValue({ maxPercent: 30 });
    expect(await (await getSettings()).json()).toEqual({ maxPercent: 30 });
    expect((await patchSettings(req({ maxPercent: 25 }))).status).toBe(200);
    expect(data.setPromoSettings).toHaveBeenCalledWith(25);
    for (const bad of [0, 101, 12.5, "x"]) expect((await patchSettings(req({ maxPercent: bad }))).status).toBe(400);
    expect(data.setPromoSettings).toHaveBeenCalledTimes(1);
  });
});

describe("PromoCodesManager owner fields", () => {
  beforeEach(() => {
    refresh.mockReset(); toast.success.mockReset(); toast.error.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "n1", maxPercent: 25 }) })));
  });
  afterEach(() => vi.unstubAllGlobals());
  const agents = [{ id: AGENT, name: "Ali Agent" }];
  const lastBody = () => JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].body));

  it("shows the owner fields only when 'Owner code' is ticked, and sends them", async () => {
    render(<PromoCodesManager codes={[]} pages={[]} agents={agents} maxPercent={30} />);
    fireEvent.click(screen.getByRole("button", { name: "Create your first code" }));
    expect(screen.queryByLabelText("Owner")).toBeNull();
    fireEvent.click(screen.getByLabelText("Owner code (a person's own code)"));
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "ali-1" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: AGENT } });
    fireEvent.change(screen.getByLabelText("Discount when typed plain (%)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Create code" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ code: "ALI-1", isOwnerCode: true, ownerAgentId: AGENT, plainPercent: 10, maxPercent: null });
  });
  it("saves the highest percent anyone may type", async () => {
    render(<PromoCodesManager codes={[]} pages={[]} agents={agents} maxPercent={30} />);
    const box = screen.getByLabelText("Highest percent anyone may type after a code");
    expect((box as HTMLInputElement).value).toBe("30");
    fireEvent.change(box, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save maximum" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(call[0]).toBe("/api/admin/landing-promo-settings");
    expect(JSON.parse(String(call[1].body))).toEqual({ maxPercent: 25 });
  });
});
