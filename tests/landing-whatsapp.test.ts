// tests/landing-whatsapp.test.ts
import { describe, it, expect } from "vitest";
import { OFFICIAL_WHATSAPP, cleanWhatsappNumber } from "@/lib/landing/whatsapp";

describe("cleanWhatsappNumber", () => {
  it("strips spaces, plus, dashes and brackets", () => {
    expect(cleanWhatsappNumber("+92 370 0199429")).toBe("923700199429");
    expect(cleanWhatsappNumber("(92) 300-1234567")).toBe("923001234567");
  });
  it("rejects too short, non-numeric and too long input", () => {
    expect(cleanWhatsappNumber("0370")).toBeNull();
    expect(cleanWhatsappNumber("abc")).toBeNull();
    expect(cleanWhatsappNumber("1234567890123456")).toBeNull();
    expect(cleanWhatsappNumber("92 300 123x567")).toBeNull();
  });
  it("accepts the 8 and 15 digit edges", () => {
    expect(cleanWhatsappNumber("12345678")).toBe("12345678");
    expect(cleanWhatsappNumber("123456789012345")).toBe("123456789012345");
  });
});

describe("OFFICIAL_WHATSAPP", () => {
  it("lists the two official numbers", () => {
    expect(OFFICIAL_WHATSAPP.map((n) => n.number)).toEqual(["923700199429", "923242167718"]);
    expect(OFFICIAL_WHATSAPP.map((n) => n.label)).toEqual(["PZ Academy main", "PZ Academy second"]);
  });
});
