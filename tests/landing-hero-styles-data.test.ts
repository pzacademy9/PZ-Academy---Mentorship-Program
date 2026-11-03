import { describe, expect, it } from "vitest";
import { SECTION_DEFS, defaultSectionData, fieldVisible, normalizeSectionData } from "@/lib/landing/sections";

const fields = SECTION_DEFS.hero.fields;
const field = (key: string) => fields.find((f) => f.key === key)!;

describe("hero style data", () => {
  it("a new hero section defaults to the fade style with medium fade", () => {
    const d = defaultSectionData("hero");
    expect(d.heroStyle).toBe("fade");
    expect(d.heroFade).toBe("medium");
  });

  it("a stored hero with no heroStyle and no image still normalizes to photo", () => {
    expect(normalizeSectionData("hero", { headline: "x" }).heroStyle).toBe("photo");
  });

  it("a stored hero with no heroStyle and an image normalizes to classic", () => {
    expect(normalizeSectionData("hero", { headline: "x", image: "https://example.com/a.jpg" }).heroStyle).toBe("classic");
  });

  it("the old values photo, poster and classic survive normalization", () => {
    for (const v of ["photo", "poster", "classic"]) {
      expect(normalizeSectionData("hero", { headline: "x", heroStyle: v }).heroStyle).toBe(v);
    }
  });

  it("the new values fade, split and editorial survive normalization", () => {
    for (const v of ["fade", "split", "editorial"]) {
      expect(normalizeSectionData("hero", { headline: "x", heroStyle: v }).heroStyle).toBe(v);
    }
  });

  it("an unknown heroFade falls back to medium", () => {
    expect(normalizeSectionData("hero", { headline: "x", heroStyle: "fade", heroFade: "huge" }).heroFade).toBe("medium");
    expect(normalizeSectionData("hero", { headline: "x", heroStyle: "fade", heroFade: "strong" }).heroFade).toBe("strong");
  });

  it("switching style keeps the pictures and text", () => {
    const stored = {
      headline: "Keep me",
      imagePc: "https://example.com/pc.jpg",
      imagePhone: "https://example.com/phone.jpg",
      image: "https://example.com/portrait.jpg",
    };
    for (const v of ["fade", "split", "editorial", "photo", "poster", "classic"]) {
      const out = normalizeSectionData("hero", { ...stored, heroStyle: v });
      expect(out.headline).toBe(stored.headline);
      expect(out.imagePc).toBe(stored.imagePc);
      expect(out.imagePhone).toBe(stored.imagePhone);
      expect(out.image).toBe(stored.image);
    }
  });
});

describe("fieldVisible", () => {
  it("heroFade is only visible for fade", () => {
    const f = field("heroFade");
    expect(fieldVisible(f, { heroStyle: "fade" }, fields)).toBe(true);
    expect(fieldVisible(f, { heroStyle: "split" }, fields)).toBe(false);
    expect(fieldVisible(f, { heroStyle: "classic" }, fields)).toBe(false);
  });

  it("the default counts when the controlling value is empty", () => {
    expect(fieldVisible(field("heroFade"), {}, fields)).toBe(true);
    expect(fieldVisible(field("heroFade"), { heroStyle: "" }, fields)).toBe(true);
  });

  it("oneOf shows the Picture box for classic and split only", () => {
    const f = field("image");
    expect(fieldVisible(f, { heroStyle: "classic" }, fields)).toBe(true);
    expect(fieldVisible(f, { heroStyle: "split" }, fields)).toBe(true);
    expect(fieldVisible(f, { heroStyle: "fade" }, fields)).toBe(false);
    expect(fieldVisible(f, { heroStyle: "editorial" }, fields)).toBe(false);
  });

  it("the computer and phone picture boxes are hidden for split and classic, shown for the others", () => {
    for (const k of ["imagePc", "imagePhone"]) {
      for (const v of ["fade", "editorial", "photo", "poster"]) expect(fieldVisible(field(k), { heroStyle: v }, fields)).toBe(true);
      for (const v of ["split", "classic"]) expect(fieldVisible(field(k), { heroStyle: v }, fields)).toBe(false);
    }
  });

  it("a field with no rule is always visible and equals still works", () => {
    expect(fieldVisible(field("headline"), {}, fields)).toBe(true);
    expect(fieldVisible(field("secondaryCtaUrl"), { secondaryCtaType: "link" }, fields)).toBe(true);
    expect(fieldVisible(field("secondaryCtaUrl"), { secondaryCtaType: "section" }, fields)).toBe(false);
  });
});
