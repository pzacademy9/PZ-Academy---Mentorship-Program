import { describe, expect, it } from "vitest";
import { PZ_ID_SHAPE, maskEmail, normalizePzId } from "@/lib/pzid/format";

describe("normalizePzId", () => {
  it("trims, lowercases and strips inner spaces", () => {
    expect(normalizePzId("  Hamid-4821 ")).toBe("hamid-4821");
    expect(normalizePzId("HAMID - 4821")).toBe("hamid-4821");
  });
});

describe("maskEmail", () => {
  it("keeps up to 2 local-part characters and masks the rest", () => {
    expect(maskEmail("jane@gmail.com")).toBe("ja***@gmail.com");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });

  it("returns *** when there is no @ and empty for empty input", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail("nodomain")).toBe("***");
  });
});

describe("PZ_ID_SHAPE", () => {
  it("accepts well-formed PZ IDs", () => {
    expect(PZ_ID_SHAPE.test("Hamid-4821")).toBe(true);
    expect(PZ_ID_SHAPE.test("Hamid-10001")).toBe(true);
  });

  it("rejects malformed PZ IDs", () => {
    expect(PZ_ID_SHAPE.test("Hamid-48")).toBe(false);
    expect(PZ_ID_SHAPE.test("Hamid4821")).toBe(false);
    expect(PZ_ID_SHAPE.test("4821")).toBe(false);
  });
});
