import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  sha256Lower,
  normalizePhone,
  buildPurchaseEvent,
  isTooOld,
} from "@/lib/meta/capi-payload";

const h = (s: string) => createHash("sha256").update(s).digest("hex");

const base = {
  registrationId: "reg-1",
  email: "  Jane@Example.COM ",
  whatsapp: "+971 50-123 4567",
  name: "Jane Mary Doe",
  fbp: "fb.1.123.456",
  fbc: "fb.1.123.abc",
  value: 150,
  currency: "aed",
  eventTimeIso: "2026-10-20T10:00:00.900Z",
  sourceUrl: "https://pharmacozyme.com/course",
};

describe("sha256Lower", () => {
  it("trims, lowercases and hex hashes", () => {
    expect(sha256Lower("  AbC ")).toBe(h("abc"));
  });
});

describe("normalizePhone", () => {
  it("keeps digits only", () => {
    expect(normalizePhone("+971 50-123 4567")).toBe("971501234567");
  });
  it("strips leading 00", () => {
    expect(normalizePhone("00971501234567")).toBe("971501234567");
  });
  it("returns empty for empty or too short", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("12345")).toBe("");
  });
});

describe("buildPurchaseEvent", () => {
  it("builds core fields", () => {
    const e = buildPurchaseEvent(base);
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("purchase-reg-1");
    expect(e.action_source).toBe("website");
    expect(e.event_source_url).toBe(base.sourceUrl);
    expect(e.event_time).toBe(Math.floor(Date.parse(base.eventTimeIso) / 1000));
    expect(Number.isInteger(e.event_time)).toBe(true);
  });
  it("hashes user data", () => {
    const u = buildPurchaseEvent(base).user_data;
    expect(u.em).toEqual([h("jane@example.com")]);
    expect((u.em as string[])[0]).toHaveLength(64);
    expect(u.ph).toEqual([h("971501234567")]);
    expect(u.fn).toEqual([h("jane")]);
    expect(u.ln).toEqual([h("mary doe")]);
    expect(u.external_id).toEqual([h("reg-1")]);
    expect(u.fbp).toBe("fb.1.123.456");
    expect(u.fbc).toBe("fb.1.123.abc");
  });
  it("omits empty phone, fbp, fbc and last name", () => {
    const u = buildPurchaseEvent({
      ...base, whatsapp: "", fbp: "", fbc: "", name: "Jane",
    }).user_data;
    expect(u).not.toHaveProperty("ph");
    expect(u).not.toHaveProperty("fbp");
    expect(u).not.toHaveProperty("fbc");
    expect(u).not.toHaveProperty("ln");
    expect(u.fn).toEqual([h("jane")]);
  });
  it("custom_data is exactly value and upper-case currency", () => {
    expect(buildPurchaseEvent(base).custom_data).toEqual({ value: 150, currency: "AED" });
  });
});

describe("isTooOld", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("false at 6 days 23 hours", () => {
    expect(isTooOld("2026-10-15T13:00:00Z", now)).toBe(false);
  });
  it("true at 7 days 1 hour", () => {
    expect(isTooOld("2026-10-15T11:00:00Z", now)).toBe(true);
  });
});
