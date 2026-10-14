// tests/landing-registration-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { listPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import {
  getPromoByCode, listPromoCodes, createPromoCode, updatePromoCode, emailUsedPromo, normalizePromoCode,
} from "@/lib/data/landing-promo-codes";
import {
  agentCodeBase, randomSuffix, normalizeAgentCode, getOrCreateAgentLink, resolveAgentCode,
} from "@/lib/data/landing-agent-links";
import { recordFunnelEvent } from "@/lib/data/landing-funnel";
import { getRegistrablePage, getRegistrablePageById } from "@/lib/data/landing-public";
import { cleanUtm } from "@/lib/landing/registration/utm";
import { emptyContent } from "@/lib/landing/content";

beforeEach(() => db.reset());

const account = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: key.toUpperCase(), kind: "bank", rows: [{ label: "Account No.", value: "123" }], display_text: `${key} text`, ...over,
});

describe("listPaymentAccounts", () => {
  it("returns accounts in the order the region lists them and skips unknown keys", async () => {
    db.state.handler = memoryHandler({ payment_accounts: [account("easypaisa", { kind: "wallet" }), account("faysal")] });
    const r = await listPaymentAccounts(["faysal", "missing", "easypaisa", "faysal"]);
    expect(r.map((a) => a.key)).toEqual(["faysal", "easypaisa"]);
    expect(r[1]).toEqual({
      key: "easypaisa", label: "EASYPAISA", kind: "wallet",
      rows: [{ label: "Account No.", value: "123" }], displayText: "easypaisa text",
    });
    expect(filterValue(db.find("payment_accounts", "select")[0], "in", "key")).toEqual(["faysal", "missing", "easypaisa"]);
  });
  it("an empty key list makes no query", async () => {
    expect(await listPaymentAccounts([])).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
  });
  it("drops malformed rows and falls back to bank for an unknown kind", async () => {
    db.state.handler = memoryHandler({
      payment_accounts: [account("x", { kind: "crypto", rows: [{ label: "ok", value: "1" }, { label: 5 }, "junk"] })],
    });
    const [a] = await listPaymentAccounts();
    expect(a.kind).toBe("bank");
    expect(a.rows).toEqual([{ label: "ok", value: "1" }]);
  });
  it("throws on a read error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(listPaymentAccounts(["faysal"])).rejects.toBeTruthy();
  });
});

const promoRow = (over: Record<string, unknown> = {}) => ({
  id: "promo-1", code: "PZ10", type: "percent", value: 10, fixed_amounts: {}, max_discount_percent: 0,
  page_ids: [], option_keys: [], max_uses: null, used_count: 0, one_per_email: false,
  starts_at: null, ends_at: null, active: true, owner_agent_id: null, created_at: "2026-10-01T00:00:00Z", ...over,
});
const promoInput = {
  code: "new10", type: "percent" as const, value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null,
};

describe("promo codes data", () => {
  it("normalizes the code before the lookup", async () => {
    db.state.handler = memoryHandler({ landing_promo_codes: [promoRow()] });
    const p = await getPromoByCode("  pz10 ");
    expect(p).toMatchObject({ id: "promo-1", code: "PZ10", type: "percent", value: 10, oneperEmail: false, usedCount: 0, maxUses: null });
    expect(filterValue(db.find("landing_promo_codes", "select")[0], "eq", "code")).toBe("PZ10");
    expect(normalizePromoCode(" ab-1 ")).toBe("AB-1");
  });
  it("a blank code is null without a query", async () => {
    expect(await getPromoByCode("   ")).toBeNull();
    expect(db.state.ops).toHaveLength(0);
  });
  it("maps fixed amounts and drops non-numbers", async () => {
    db.state.handler = memoryHandler({ landing_promo_codes: [promoRow({ type: "fixed", fixed_amounts: { PKR: 500, AED: "x" } })] });
    expect((await getPromoByCode("PZ10"))?.fixedAmounts).toEqual({ PKR: 500 });
  });
  it("lists codes", async () => {
    db.state.handler = memoryHandler({ landing_promo_codes: [promoRow(), promoRow({ id: "promo-2", code: "B" })] });
    expect((await listPromoCodes()).map((p) => p.id).sort()).toEqual(["promo-1", "promo-2"]);
  });
  it("create uppercases the code and maps a unique violation to duplicate", async () => {
    db.state.handler = (op) => (op.op === "insert" ? { data: null, error: { code: "23505", message: "dup" } } : { data: null, error: null });
    expect(await createPromoCode(promoInput)).toEqual({ ok: false, reason: "duplicate" });
    expect(db.find("landing_promo_codes", "insert")[0].payload).toMatchObject({ code: "NEW10", one_per_email: false, type: "percent" });
  });
  it("create returns the new id", async () => {
    db.state.handler = () => ({ data: { id: "promo-9" }, error: null });
    expect(await createPromoCode(promoInput)).toEqual({ ok: true, id: "promo-9" });
  });
  it("update writes only the patched fields and reports a missing id", async () => {
    db.state.handler = () => ({ data: null, error: null });
    expect(await updatePromoCode("promo-x", { active: false })).toEqual({ ok: false, reason: "not-found" });
    expect(db.find("landing_promo_codes", "update")[0].payload).toEqual({ active: false });
  });
  it("emailUsedPromo counts real registrations for that promo and the lowercased email", async () => {
    db.state.handler = () => ({ data: null, error: null, count: 1 });
    expect(await emailUsedPromo("promo-1", " A@B.com ")).toBe(true);
    const op = db.find("landing_registrations", "select")[0];
    expect(op.head).toBe(true);
    expect(filterValue(op, "eq", "promo_code_id")).toBe("promo-1");
    expect(filterValue(op, "eq", "email")).toBe("a@b.com");
    expect(filterValue(op, "eq", "is_test")).toBe(false);
  });
  it("emailUsedPromo is false at zero", async () => {
    db.state.handler = () => ({ data: null, error: null, count: 0 });
    expect(await emailUsedPromo("promo-1", "a@b.com")).toBe(false);
  });
});

describe("agent links", () => {
  it("builds name-xxx codes from the first name", () => {
    expect(agentCodeBase("Ayesha Siddiqui")).toBe("ayesha");
    expect(agentCodeBase("   ")).toBe("agent");
    expect(agentCodeBase("Muhammad-Abdurrahman Khan")).toBe("muhammad");
    expect(randomSuffix(() => 0)).toBe("000");
    expect(randomSuffix(() => 0.999)).toBe("zzz");
  });
  it("normalizes and validates a code", () => {
    expect(normalizeAgentCode("  Ayesha-7K2 ")).toBe("ayesha-7k2");
    expect(normalizeAgentCode("a")).toBeNull();
    expect(normalizeAgentCode("bad code!")).toBeNull();
    expect(normalizeAgentCode("x".repeat(41))).toBeNull();
  });
  it("returns the existing link without inserting", async () => {
    db.state.handler = () => ({ data: { code: "ayesha-7k2" }, error: null });
    expect(await getOrCreateAgentLink("agent-1")).toEqual({ code: "ayesha-7k2" });
    expect(db.find("landing_agent_links", "insert")).toHaveLength(0);
  });
  const agentScript = (insert: (code: string) => { data: unknown; error: unknown }, role = "sales_agent") => (op: import("./helpers/supabase-mock").Op) => {
    if (op.table === "landing_agent_links" && op.op === "select") return { data: null, error: null };
    if (op.table === "profiles") return { data: { full_name: "Ayesha Siddiqui", role }, error: null };
    if (op.table === "landing_agent_links" && op.op === "insert") return insert((op.payload as { code: string }).code);
    return { data: null, error: null };
  };
  it("creates a link for a sales agent", async () => {
    db.state.handler = agentScript((code) => ({ data: { code }, error: null }));
    expect(await getOrCreateAgentLink("agent-1", () => 0.5)).toEqual({ code: "ayesha-iii" });
    expect(db.find("landing_agent_links", "insert")[0].payload).toEqual({ agent_id: "agent-1", code: "ayesha-iii" });
  });
  it("retries with a new code after a collision", async () => {
    let inserts = 0;
    db.state.handler = agentScript((code) => (inserts++ === 0 ? { data: null, error: { code: "23505" } } : { data: { code }, error: null }));
    const seq = [0, 0, 0, 0.5, 0.5, 0.5];
    let i = 0;
    expect((await getOrCreateAgentLink("agent-1", () => seq[i++])).code).toBe("ayesha-iii");
    expect(inserts).toBe(2);
  });
  it("refuses someone who is not a sales agent", async () => {
    db.state.handler = agentScript((code) => ({ data: { code }, error: null }), "student");
    await expect(getOrCreateAgentLink("user-1")).rejects.toMatchObject({ reason: "not-sales-agent" });
  });
  it("resolveAgentCode maps a code to an active sales agent", async () => {
    db.state.handler = memoryHandler({
      landing_agent_links: [{ agent_id: "agent-1", code: "ayesha-7k2" }],
      profiles: [{ id: "agent-1", role: "sales_agent" }],
    });
    expect(await resolveAgentCode("AYESHA-7K2")).toEqual({ agentId: "agent-1" });
  });
  it("resolveAgentCode ignores demoted agents, unknown codes and malformed input", async () => {
    db.state.handler = memoryHandler({
      landing_agent_links: [{ agent_id: "agent-1", code: "ayesha-7k2" }],
      profiles: [{ id: "agent-1", role: "student" }],
    });
    expect(await resolveAgentCode("ayesha-7k2")).toBeNull();
    expect(await resolveAgentCode("nope-123")).toBeNull();
    db.reset();
    expect(await resolveAgentCode("<script>")).toBeNull();
    expect(db.state.ops).toHaveLength(0);
  });
});

describe("funnel events and UTMs", () => {
  it("cleanUtm keeps only the five utm keys, trimmed and capped", () => {
    expect(cleanUtm(null)).toEqual({});
    expect(cleanUtm({ utm_source: " fb ", evil: "x", utm_term: "", utm_campaign: "c".repeat(300) })).toEqual({
      utm_source: "fb", utm_campaign: "c".repeat(200),
    });
  });
  it("records an event with cleaned UTMs", async () => {
    db.state.handler = memoryHandler({});
    await recordFunnelEvent({ pageId: "p1", sessionId: "s-12345678", type: "view", utm: { utm_source: " fb ", evil: "x" }, agentId: null });
    expect(db.find("landing_funnel_events", "insert")[0].payload).toEqual({
      page_id: "p1", session_id: "s-12345678", type: "view", utm: { utm_source: "fb" }, agent_id: null,
    });
  });
  it("never throws on a write error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(recordFunnelEvent({ pageId: "p1", sessionId: "s-12345678", type: "start", utm: {}, agentId: null })).resolves.toBeUndefined();
  });
});

describe("public page lookup", () => {
  const pageRow = (over: Record<string, unknown> = {}) => ({
    id: "p1", slug: "ppc-b3", title: "PPC", status: "published", published: emptyContent("course"),
    sheet_id: "sheet-1", drive_folder_id: null, ref_prefix: "PPC", course_id: null, ...over,
  });
  it("hides drafts and pages with no published copy", async () => {
    db.state.handler = memoryHandler({ landing_pages: [pageRow({ status: "draft" })] });
    expect(await getRegistrablePage("ppc-b3")).toBeNull();
    db.state.handler = memoryHandler({ landing_pages: [pageRow({ published: null })] });
    expect(await getRegistrablePage("ppc-b3")).toBeNull();
  });
  it("returns a closed page with its registration config", async () => {
    db.state.handler = memoryHandler({ landing_pages: [pageRow({ status: "closed" })] });
    const p = await getRegistrablePage("ppc-b3");
    expect(p).toMatchObject({ id: "p1", status: "closed", sheetId: "sheet-1", driveFolderId: null, refPrefix: "PPC" });
    expect(p?.registration.enabled).toBe(false);
  });
  it("looks up by id too", async () => {
    db.state.handler = memoryHandler({ landing_pages: [pageRow()] });
    expect((await getRegistrablePageById("p1"))?.slug).toBe("ppc-b3");
  });
  it("throws on a read error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(getRegistrablePage("ppc-b3")).rejects.toBeTruthy();
  });
});
