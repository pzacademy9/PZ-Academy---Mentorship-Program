import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { Hero, fadeOverlayClass } from "@/components/landing/sections/Hero";

const register = { url: "https://x.com/r", label: "Join", closed: false };
const html = (data: Record<string, unknown>, sectionIds?: string[]) =>
  renderToStaticMarkup(<>{Hero({ data, register, sectionIds })}</>);

const PC = "https://drive.google.com/uc?export=view&id=pcfile1";
const PH = "https://drive.google.com/uc?export=view&id=phonefile2";
const PORTRAIT = "https://drive.google.com/uc?export=view&id=portrait3";
const LONG_FACT = "A".repeat(10) + " fact line that is deliberately very long so that it must wrap on a small phone screen ok";
const base = { headline: "A fake headline", subheadline: "Fake sub text", dateLine: "16 Sept", eyebrow: "Fake eyebrow", badges: [{ text: "Fact one" }, { text: LONG_FACT }] };
const STYLES = ["fade", "split", "editorial"] as const;

describe("fade hero (Style 1)", () => {
  const out = html({ ...base, heroStyle: "fade", imagePc: PC, imagePhone: PH });
  it("renders the headline, the buttons and every fact in full", () => {
    expect(out).toContain("A fake headline");
    expect(out).toContain("Join");
    expect(out).toContain("Fact one");
    expect(out).toContain(LONG_FACT);
    expect(out).not.toMatch(/truncate|line-clamp/);
  });
  it("fadeOverlayClass gives three different classes and falls back to medium", () => {
    const l = fadeOverlayClass("light");
    const m = fadeOverlayClass("medium");
    const s = fadeOverlayClass("strong");
    expect(new Set([l, m, s]).size).toBe(3);
    expect(fadeOverlayClass("nonsense")).toBe(m);
    expect(fadeOverlayClass("")).toBe(m);
  });
  it("renders the matching overlay class for light, medium and strong", () => {
    for (const f of ["light", "medium", "strong"]) {
      const o = html({ ...base, heroStyle: "fade", heroFade: f, imagePc: PC, imagePhone: PH });
      expect(o).toContain(fadeOverlayClass(f));
    }
    const noFade = html({ ...base, heroStyle: "fade", imagePc: PC, imagePhone: PH });
    expect(noFade).toContain(fadeOverlayClass("medium"));
  });
  it("with no picture renders text on the green background and no picture element", () => {
    const o = html({ ...base, heroStyle: "fade" });
    expect(o).not.toContain("<picture");
    expect(o).not.toContain("<img");
    expect(o).toContain("bg-landing-deep");
    expect(o).toContain("A fake headline");
  });
  it("with only a phone picture still renders a picture", () => {
    const o = html({ ...base, heroStyle: "fade", imagePhone: PH });
    expect(o).toContain("<picture");
    expect(o).toContain('src="/api/cover/phonefile2"');
  });
  it("with only a computer picture still renders a picture", () => {
    expect(html({ ...base, heroStyle: "fade", imagePc: PC })).toContain("<picture");
  });
});

describe("split hero (Style 2)", () => {
  it("renders the portrait beside the text", () => {
    const o = html({ ...base, heroStyle: "split", image: PORTRAIT });
    expect(o).toContain("<img");
    expect(o).toContain("portrait3");
    expect(o).toContain("A fake headline");
    expect(o).toContain(LONG_FACT);
  });
  it("renders no portrait box without a picture", () => {
    const o = html({ ...base, heroStyle: "split" });
    expect(o).not.toContain("<img");
    expect(o).not.toContain("<picture");
    expect(o).toContain("A fake headline");
  });
});

describe("editorial hero (Style 3)", () => {
  it("renders a serif headline and the wide picture below", () => {
    const o = html({ ...base, heroStyle: "editorial", imagePc: PC, imagePhone: PH });
    expect(o).toMatch(/<h1[^>]*font-serif/);
    expect(o).toContain("<picture");
    expect(o.indexOf("A fake headline")).toBeLessThan(o.indexOf("<picture"));
  });
  it("renders no picture box without one", () => {
    const o = html({ ...base, heroStyle: "editorial" });
    expect(o).not.toContain("<picture");
    expect(o).not.toContain("<img");
    expect(o).toContain("bg-landing-deep");
  });
});

describe("all new styles", () => {
  for (const s of STYLES) {
    it(`${s}: a very long unbroken word in the headline wraps`, () => {
      const o = html({ ...base, headline: "W".repeat(200), heroStyle: s, imagePc: PC, imagePhone: PH, image: PORTRAIT });
      expect(o).toMatch(/<h1[^>]*break-words/);
    });
    it(`${s}: the second button shows only with a label and a safe target`, () => {
      const withBtn = html({ ...base, heroStyle: s, secondaryCtaLabel: "Watch preview", secondaryCtaType: "link", secondaryCtaUrl: "https://example.com/p" });
      expect(withBtn).toContain("Watch preview");
      expect(withBtn).toContain('href="https://example.com/p"');
      expect(html({ ...base, heroStyle: s, secondaryCtaType: "link", secondaryCtaUrl: "https://example.com/p" })).not.toContain("example.com/p");
      expect(html({ ...base, heroStyle: s, secondaryCtaLabel: "Bad", secondaryCtaType: "link", secondaryCtaUrl: "javascript:alert(1)" })).not.toContain("Bad");
      expect(html({ ...base, heroStyle: s, secondaryCtaLabel: "Go", secondaryCtaType: "section", secondaryCtaSection: "nope" }, ["a"])).not.toContain(">Go<");
    });
    it(`${s}: none of the Stitch demo text is in the output`, () => {
      const o = html({ ...base, heroStyle: s, imagePc: PC, imagePhone: PH, image: PORTRAIT });
      for (const bad of ["Masterclass", "Cohort", "Limited to", "CE credits", "PharmaZyme"]) expect(o).not.toContain(bad);
    });
    it(`${s}: shows the date line when given`, () => {
      expect(html({ ...base, heroStyle: s })).toContain("16 Sept");
    });
  }
});
