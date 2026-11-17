import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/landing-promo-codes", () => ({
  emailUsedPromo: vi.fn(), getPromoByCode: vi.fn(), getPromoSettings: vi.fn(async () => ({ maxPercent: 30 })),
}));
vi.mock("@/lib/landing/registration/promo-resolve", () => ({
  resolvePromoWith: vi.fn(async () => ({ promo: null, overMax: 30 })),
}));
vi.mock("@/lib/api/landing-public-http", () => ({
  loadPublicPage: vi.fn(async () => ({ ok: true, page: { id: "pg1", registration: {} } })),
  publicJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  variantParam: () => null,
}));
vi.mock("@/lib/landing/registration/pricing", () => ({
  computeQuote: vi.fn(() => ({ ok: true, isFree: false, total: 100, currency: "PKR", optionKeys: ["a"] })),
}));

import { POST } from "@/app/api/landing/[slug]/quote/route";

describe("quote route over the limit", () => {
  it("answers over_max and never exposes the limit number", async () => {
    const req = new NextRequest("http://x/api/landing/s/quote", {
      method: "POST",
      body: JSON.stringify({ regionKey: "PK", mode: "live", optionKeys: ["a"], tierKey: "individual", groupSize: 1, promoCode: "SAVE-90%" }),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "s" }) });
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json.promo).toEqual({ ok: false, reason: "over_max" });
    expect(json.quote).toBeDefined();
    expect(text).not.toMatch(/"max"/);
  });
});
