import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/crm/phone";

describe("normalizePhone", () => {
  // Every literal below is a real value from the MDC3 Master Sheet's
  // WhatsApp column — five formats in fourteen consecutive rows.
  it("prefixes a bare 10-digit Pakistani mobile starting with 3", () => {
    expect(normalizePhone("3234267102")).toEqual({ ok: true, e164: "+923234267102", country: "PK" });
    expect(normalizePhone("3198071841")).toEqual({ ok: true, e164: "+923198071841", country: "PK" });
  });

  it("accepts an already 92-prefixed 12-digit number", () => {
    expect(normalizePhone("923478539155")).toEqual({ ok: true, e164: "+923478539155", country: "PK" });
  });

  it("strips a leading zero from an 11-digit local format", () => {
    expect(normalizePhone("03255965790")).toEqual({ ok: true, e164: "+923255965790", country: "PK" });
  });

  it("ignores spaces and punctuation before deciding", () => {
    expect(normalizePhone("0325 5965790")).toEqual({ ok: true, e164: "+923255965790", country: "PK" });
    expect(normalizePhone("92 370 5109810")).toEqual({ ok: true, e164: "+923705109810", country: "PK" });
    expect(normalizePhone("+92-321-7654321")).toEqual({ ok: true, e164: "+923217654321", country: "PK" });
  });

  it("recognises UAE and Saudi numbers by prefix", () => {
    expect(normalizePhone("971568346151")).toEqual({ ok: true, e164: "+971568346151", country: "AE" });
    expect(normalizePhone("966512345678")).toEqual({ ok: true, e164: "+966512345678", country: "SA" });
  });

  it("drops an international 00 prefix", () => {
    expect(normalizePhone("00923234267102")).toEqual({ ok: true, e164: "+923234267102", country: "PK" });
  });

  it("reports empty input rather than guessing", () => {
    expect(normalizePhone("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone("   ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(null)).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: "empty" });
  });

  it("flags two numbers crammed into one cell as ambiguous", () => {
    // Common in these sheets. Guessing which one is reachable is worse than
    // handing the admin a short review list.
    expect(normalizePhone("0300 1234567 / 0321 7654321")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("flags anything that matches no rule as ambiguous", () => {
    expect(normalizePhone("12345")).toEqual({ ok: false, reason: "ambiguous" });
    expect(normalizePhone("N/A")).toEqual({ ok: false, reason: "ambiguous" });
    expect(normalizePhone("4234567890")).toEqual({ ok: false, reason: "ambiguous" });
  });
});
