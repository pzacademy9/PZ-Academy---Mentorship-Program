import { describe, it, expect } from "vitest";
import { SECTION_TYPES, SECTION_DEFS, defaultSectionData, normalizeSectionData, sectionDataSchema } from "@/lib/landing/sections";

describe("hero content model", () => {
  it("old page with a picture becomes classic", () => {
    const d = normalizeSectionData("hero", { image: "https://x/a.jpg", headline: "H" });
    expect(d.heroStyle).toBe("classic");
    expect(d.secondaryCtaType).toBe("link");
    expect(d.textSize).toBe("normal");
    expect(d.image).toBe("https://x/a.jpg");
  });
  it("no picture gives photo", () => {
    expect(normalizeSectionData("hero", { headline: "H" }).heroStyle).toBe("photo");
  });
  it("old second button is a link; unknown values fall back", () => {
    expect(normalizeSectionData("hero", { secondaryCtaLabel: "Go", secondaryCtaUrl: "https://x.com" }).secondaryCtaType).toBe("link");
    expect(normalizeSectionData("hero", { heroStyle: "weird" }).heroStyle).toBe("photo");
    expect(normalizeSectionData("hero", { textSize: "huge" }).textSize).toBe("normal");
  });
  it("default is photo", () => {
    expect(defaultSectionData("hero").heroStyle).toBe("photo");
  });
  it("whatsapp field validates digits", () => {
    const s = sectionDataSchema("hero");
    const base = defaultSectionData("hero");
    expect(s.safeParse({ ...base, secondaryCtaWhatsapp: "abc" }).success).toBe(false);
    expect(s.safeParse({ ...base, secondaryCtaWhatsapp: "923700199429" }).success).toBe(true);
    expect(s.safeParse({ ...base, secondaryCtaWhatsapp: "" }).success).toBe(true);
  });
  it("every section has textSize", () => {
    for (const t of SECTION_TYPES) expect(SECTION_DEFS[t].fields.some((f) => f.key === "textSize")).toBe(true);
  });
});
