import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { emptyContent, normalizeContent, type LandingContent } from "@/lib/landing/content";
import { Hero } from "@/components/landing/sections/Hero";
import { OLD } from "./fixtures/hero-old-data";

const register = { url: "https://x.com/r", label: "Join", closed: false };
const html = (data: Record<string, unknown>, sectionIds?: string[]) =>
  renderToStaticMarkup(<>{Hero({ data, register, sectionIds })}</>);

const PC = "https://drive.google.com/uc?export=view&id=pcfile1";
const PH = "https://drive.google.com/uc?export=view&id=phonefile2";
const base = { headline: "A very long headline", subheadline: "Sub", dateLine: "16 Sept" };

describe("classic hero is unchanged", () => {
  it("old data (no heroStyle) renders exactly the previous markup", () => {
    expect(html(OLD)).toBe(readFileSync("tests/fixtures/hero-classic-old.html", "utf8"));
  });
  it("heroStyle classic renders the same markup", () => {
    expect(html({ ...OLD, heroStyle: "classic" })).toBe(readFileSync("tests/fixtures/hero-classic-old.html", "utf8"));
  });
});

describe("photo hero", () => {
  const out = html({ ...base, heroStyle: "photo", imagePc: PC, imagePhone: PH });
  it("has one picture, a PC source, the phone img, eager and high priority", () => {
    expect(out.match(/<picture/g)).toHaveLength(1);
    expect(out).toMatch(/<source[^>]*media="\(min-width: 768px\)"[^>]*srcSet="\/api\/cover\/pcfile1"|<source[^>]*srcSet="\/api\/cover\/pcfile1"[^>]*media="\(min-width: 768px\)"/);
    expect(out).toContain('src="/api/cover/phonefile2"');
    expect(out).toContain('fetchPriority="high"');
    expect(out).toContain('loading="eager"');
    expect(out).toContain("aspect-[9/16]");
    expect(out).toContain("md:aspect-[16/9]");
  });
  it("uses white text over a dark fade and wraps long words", () => {
    expect(out).toContain("text-white");
    expect(out).toContain("bg-gradient-to-t");
    expect(out).toContain("break-words");
  });
  it("only phone image: no differing source, img uses the phone file", () => {
    const o = html({ ...base, heroStyle: "photo", imagePhone: PH });
    expect(o).toContain('src="/api/cover/phonefile2"');
    expect(o).not.toContain("pcfile1");
    expect(o.match(/\/api\/cover\/phonefile2/g)!.length).toBeLessThanOrEqual(2);
  });
  it("only PC image: img falls back to the PC file", () => {
    const o = html({ ...base, heroStyle: "photo", imagePc: PC });
    expect(o).toContain('src="/api/cover/pcfile1"');
  });
  it("no images: no picture, no img, dark text on the plain background", () => {
    const o = html({ ...base, heroStyle: "photo" });
    expect(o).not.toContain("<picture");
    expect(o).not.toContain("<img");
    expect(o).toContain("text-landing-deep");
    expect(o).toContain("break-words");
  });
});

describe("poster hero", () => {
  const out = html({ ...base, eyebrow: "EYE", heroStyle: "poster", imagePc: PC, imagePhone: PH, badges: [{ text: "Bdg" }] });
  it("shows the picture whole (contain) with no headline overlay", () => {
    expect(out).toContain("object-contain");
    expect(out).not.toContain("<h1");
    expect(out).not.toContain("EYE");
    expect(out).not.toContain("Bdg");
  });
  it("keeps the Register button and date line", () => {
    expect(out).toContain("Join");
    expect(out).toContain("16 Sept");
  });
});

describe("second button", () => {
  const photo = { ...base, heroStyle: "photo", imagePc: PC, secondaryCtaLabel: "More" };
  it("section target becomes a #id anchor when enabled", () => {
    const o = html({ ...photo, secondaryCtaType: "section", secondaryCtaSection: "s-faq" }, ["s-faq", "s-x"]);
    expect(o).toContain('href="#s-faq"');
    expect(o).toContain(">More<");
  });
  it("section target not in sectionIds renders nothing", () => {
    expect(html({ ...photo, secondaryCtaType: "section", secondaryCtaSection: "s-gone" }, ["s-faq"])).not.toContain(">More<");
    expect(html({ ...photo, secondaryCtaType: "section", secondaryCtaSection: "s-faq" })).not.toContain(">More<");
  });
  it("link needs a safe url", () => {
    const ok = html({ ...photo, secondaryCtaType: "link", secondaryCtaUrl: "https://example.com/a" });
    expect(ok).toContain('href="https://example.com/a"');
    expect(ok).toContain('rel="noopener noreferrer"');
    expect(html({ ...photo, secondaryCtaType: "link", secondaryCtaUrl: "javascript:alert(1)" })).not.toContain(">More<");
  });
  it("whatsapp opens wa.me in a new tab", () => {
    const o = html({ ...photo, secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "+92 370 0199429" });
    expect(o).toContain('href="https://wa.me/923700199429"');
    expect(o).toContain('target="_blank"');
    expect(o).toContain('rel="noopener noreferrer"');
  });
  it("whatsapp with no digits renders nothing", () => {
    expect(html({ ...photo, secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "abc" })).not.toContain(">More<");
  });
  it("works on poster and classic too", () => {
    expect(html({ ...base, heroStyle: "poster", imagePc: PC, secondaryCtaLabel: "More", secondaryCtaType: "whatsapp", secondaryCtaWhatsapp: "923001112222" })).toContain("wa.me/923001112222");
    expect(html({ ...base, heroStyle: "classic", image: PC, secondaryCtaLabel: "More", secondaryCtaType: "section", secondaryCtaSection: "a" }, ["a"])).toContain('href="#a"');
  });
});

const page = (sections: { id: string; type: string; enabled: boolean; data: Record<string, unknown> }[]): LandingContent => {
  const c = emptyContent("course");
  return normalizeContent({ ...c, sections });
};
const renderPage = (c: LandingContent) => renderToStaticMarkup(<LandingRenderer content={c} status="published" kind="course" />);

describe("text size", () => {
  it("data-text-size=small appears only on sections set to small", () => {
    const out = renderPage(page([
      { id: "s-hero", type: "hero", enabled: true, data: { headline: "H", textSize: "small" } },
      { id: "s-faq", type: "faq", enabled: true, data: { items: [{ q: "q", a: "a" }], textSize: "normal" } },
    ]));
    expect(out.match(/data-text-size="small"/g)).toHaveLength(1);
    expect(out).toMatch(/<section[^>]*id="s-hero"[^>]*data-text-size="small"|<section[^>]*data-text-size="small"[^>]*id="s-hero"/);
    expect(out).not.toMatch(/<section[^>]*id="s-faq"[^>]*data-text-size/);
  });
  it("sections wrap long words", () => {
    expect(renderPage(page([{ id: "s-hero", type: "hero", enabled: true, data: { headline: "H" } }]))).toMatch(/<section[^>]*id="s-hero"[^>]*class="[^"]*break-words/);
  });
});

describe("dead anchors", () => {
  const hero = { id: "s-hero", type: "hero", enabled: true, data: { headline: "H", secondaryCtaLabel: "Jump", secondaryCtaType: "section", secondaryCtaSection: "s-faq" } };
  it("a target that renders nothing hides the second button", () => {
    const out = renderPage(page([hero, { id: "s-faq", type: "faq", enabled: true, data: { items: [] } }]));
    expect(out).not.toContain(">Jump<");
    expect(out).not.toContain('href="#s-faq"');
  });
  it("a target that renders keeps the button", () => {
    const out = renderPage(page([hero, { id: "s-faq", type: "faq", enabled: true, data: { items: [{ q: "q", a: "a" }] } }]));
    expect(out).toContain('href="#s-faq"');
  });
});

describe("Register menu is never clipped", () => {
  const two = { ...register, builtIn: true, modes: ["live", "recorded"] as ("live" | "recorded")[] };
  const cases: [string, Record<string, unknown>][] = [
    ["photo with picture", { ...base, heroStyle: "photo", imagePc: PC }],
    ["photo no picture", { ...base, heroStyle: "photo" }],
    ["poster", { ...base, heroStyle: "poster", imagePc: PC }],
    ["classic", { ...OLD }],
  ];
  for (const [name, data] of cases) {
    it(`${name}: no overflow-hidden between the buttons and the hero root`, () => {
      const { container } = render(<>{Hero({ data, register: two })}</>);
      const btn = container.querySelector("[aria-haspopup='menu']")!;
      expect(btn).not.toBeNull();
      for (let el: Element | null = btn.parentElement; el && el !== container; el = el.parentElement) {
        expect(el.className).not.toMatch(/overflow-hidden/);
      }
    });
  }
});
