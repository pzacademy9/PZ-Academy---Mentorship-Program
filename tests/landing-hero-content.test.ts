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

import { computeReadiness, emptyContent, normalizeContent, type LandingContent } from "@/lib/landing/content";
import { OLD } from "./fixtures/hero-old-data";

describe("hero readiness", () => {
  const page = { title: "Page", slug: "my-page" };
  const withHero = (heroData: Record<string, unknown>, extra: LandingContent["sections"] = []): LandingContent => {
    const c = emptyContent("course");
    return normalizeContent({
      ...c,
      settings: { ...c.settings, registerUrl: "https://x.com/r" },
      seo: { ...c.seo, description: "d" },
      sections: [{ id: "s-hero", type: "hero", enabled: true, data: { headline: "H", ...heroData } }, ...extra],
    });
  };
  const faq = (enabled: boolean) => ({ id: "s-faq", type: "faq" as const, enabled, data: { items: [{ q: "q", a: "a" }] } });
  const heroProblems = (c: LandingContent) => computeReadiness(c, page).problems.filter((p) => p.sectionId === "s-hero");
  const words = /variant|override|schema|enum/i;

  it("an old page adds no new problem", () => {
    expect(heroProblems(withHero(OLD))).toEqual([]);
    expect(heroProblems(withHero({}))).toEqual([]);
  });
  it("section button with no target, a missing target or a disabled target", () => {
    const base = { secondaryCtaLabel: "More", secondaryCtaType: "section" };
    expect(heroProblems(withHero(base, [faq(true)]))).toHaveLength(1);
    expect(heroProblems(withHero({ ...base, secondaryCtaSection: "s-gone" }, [faq(true)]))).toHaveLength(1);
    expect(heroProblems(withHero({ ...base, secondaryCtaSection: "s-faq" }, [faq(false)]))).toHaveLength(1);
    expect(heroProblems(withHero({ ...base, secondaryCtaSection: "s-faq" }, [faq(true)]))).toEqual([]);
  });
  it("link with a label but no safe link", () => {
    expect(heroProblems(withHero({ secondaryCtaLabel: "More", secondaryCtaType: "link", secondaryCtaUrl: "" }))).toHaveLength(1);
    expect(heroProblems(withHero({ secondaryCtaLabel: "More", secondaryCtaType: "link", secondaryCtaUrl: "https://a.com" }))).toEqual([]);
  });
  it("whatsapp with a label but no number", () => {
    expect(heroProblems(withHero({ secondaryCtaLabel: "Chat", secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "" }))).toHaveLength(1);
    expect(heroProblems(withHero({ secondaryCtaLabel: "Chat", secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "923001112222" }))).toEqual([]);
  });
  it("poster style with no picture", () => {
    expect(heroProblems(withHero({ heroStyle: "poster" }))).toHaveLength(1);
    expect(heroProblems(withHero({ heroStyle: "poster", imagePhone: "https://a.com/p.jpg" }))).toEqual([]);
  });
  it("empty second button text while a target is set", () => {
    expect(heroProblems(withHero({ secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "923001112222" }))).toHaveLength(1);
    expect(heroProblems(withHero({ secondaryCtaType: "section", secondaryCtaSection: "s-faq" }, [faq(true)]))).toHaveLength(1);
  });
  it("messages are plain words", () => {
    const all = [
      withHero({ secondaryCtaLabel: "M", secondaryCtaType: "section" }),
      withHero({ secondaryCtaLabel: "M", secondaryCtaType: "link" }),
      withHero({ secondaryCtaLabel: "M", secondaryCtaType: "whatsapp" }),
      withHero({ heroStyle: "poster" }),
      withHero({ secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "923001112222" }),
    ].flatMap(heroProblems);
    expect(all).toHaveLength(5);
    for (const p of all) expect(p.message).not.toMatch(words);
  });
});
