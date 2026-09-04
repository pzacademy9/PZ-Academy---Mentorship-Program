import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizeName, scoreDuplicate } from "@/lib/crm/identity";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Almas.Raza07@Gmail.COM ")).toBe("almas.raza07@gmail.com");
  });

  it("returns null for blank or malformed input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("missing@domain")).toBeNull();
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and title-cases", () => {
    expect(normalizeName("  sonia   hayat ")).toBe("Sonia Hayat");
  });

  it("strips honorifics so Dr.Awais and Awais compare equal", () => {
    expect(normalizeName("Dr.Awais Ahmed")).toBe("Awais Ahmed");
    expect(normalizeName("Dr Muhammad Sadiq")).toBe("Muhammad Sadiq");
    expect(normalizeName("MR. Said Rahman")).toBe("Said Rahman");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("scoreDuplicate", () => {
  const base = { email: "areeba@gmail.com", phoneE164: "+923345545375", fullName: "Areeba Fatima" };

  it("treats an identical email as the same person", () => {
    const verdict = scoreDuplicate(base, { email: "areeba@gmail.com", phoneE164: null, fullName: "A Fatima" });
    expect(verdict.kind).toBe("same");
  });

  it("treats an identical phone as the same person", () => {
    const verdict = scoreDuplicate(base, { email: null, phoneE164: "+923345545375", fullName: "Different Name" });
    expect(verdict.kind).toBe("same");
  });

  it("flags same name plus same phone tail under different normalization for review", () => {
    // The same human whose number was typed once with and once without a
    // country code, where one of the two failed to normalize identically.
    const verdict = scoreDuplicate(
      { email: "a@x.com", phoneE164: "+923345545375", fullName: "Areeba Fatima" },
      { email: "b@y.com", phoneE164: "+13345545375", fullName: "areeba  fatima" },
    );
    expect(verdict.kind).toBe("review");
  });

  it("flags a typo'd email domain with a matching name for review", () => {
    const verdict = scoreDuplicate(
      { email: "areeba@gmail.com", phoneE164: null, fullName: "Areeba Fatima" },
      { email: "areeba@gmail.con", phoneE164: null, fullName: "Areeba Fatima" },
    );
    expect(verdict.kind).toBe("review");
  });

  it("does not flag two different people who merely share a first name", () => {
    const verdict = scoreDuplicate(
      { email: "amna@x.com", phoneE164: "+923254465477", fullName: "Amna Nasir" },
      { email: "amal@y.com", phoneE164: "+923303046350", fullName: "Amal Hussain Bakhsh" },
    );
    expect(verdict.kind).toBe("different");
  });

  it("does not flag two contacts that share nothing", () => {
    const verdict = scoreDuplicate(base, { email: "zzz@q.com", phoneE164: "+971568346151", fullName: "Ammara Rana" });
    expect(verdict.kind).toBe("different");
  });

  it("never calls two null-email null-phone contacts the same", () => {
    const verdict = scoreDuplicate(
      { email: null, phoneE164: null, fullName: "Aneera" },
      { email: null, phoneE164: null, fullName: "Aneera" },
    );
    expect(verdict.kind).not.toBe("same");
  });
});
