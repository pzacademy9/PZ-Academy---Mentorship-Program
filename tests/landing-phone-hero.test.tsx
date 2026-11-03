import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { PhoneScrollReveal } from "@/components/landing/PhoneScrollReveal";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { Hero } from "@/components/landing/sections/Hero";
import { emptyContent, normalizeContent, type LandingContent } from "@/lib/landing/content";

type IoCb = (entries: { isIntersecting: boolean }[]) => void;
let ioCb: IoCb | null = null;
function mockObserver() {
  class FakeIo {
    constructor(cb: IoCb) { ioCb = cb; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeIo);
}

afterEach(() => { vi.unstubAllGlobals(); ioCb = null; document.body.innerHTML = ""; });

describe("PhoneScrollReveal", () => {
  it("is hidden while the hero is on screen and shown once it scrolls away", () => {
    mockObserver();
    const hero = document.createElement("section");
    hero.id = "hero-1";
    document.body.appendChild(hero);
    const { container } = render(<PhoneScrollReveal heroId="hero-1" className="x">hi</PhoneScrollReveal>);
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute("data-phone-hidden")).toBe("true");
    act(() => ioCb?.([{ isIntersecting: false }]));
    expect(box.getAttribute("data-phone-hidden")).toBe("false");
    act(() => ioCb?.([{ isIntersecting: true }]));
    expect(box.getAttribute("data-phone-hidden")).toBe("true");
  });
  it("is always shown when the page has no hero", () => {
    const { container } = render(<PhoneScrollReveal className="x">hi</PhoneScrollReveal>);
    expect((container.firstElementChild as HTMLElement).getAttribute("data-phone-hidden")).toBe("false");
  });
  it("is shown when the hero cannot be found", () => {
    mockObserver();
    const { container } = render(<PhoneScrollReveal heroId="missing" className="x">hi</PhoneScrollReveal>);
    expect((container.firstElementChild as HTMLElement).getAttribute("data-phone-hidden")).toBe("false");
  });
});

function page(): LandingContent {
  const c = emptyContent("course");
  c.settings.whatsappNumber = "923001234567";
  c.sections = [{ id: "hero-a", type: "hero", enabled: true, data: { headline: "H", heroStyle: "fade", badges: [{ text: "One" }] } }] as LandingContent["sections"];
  return normalizeContent(c);
}

describe("phone layout", () => {
  const out = renderToStaticMarkup(<LandingRenderer content={page()} status="published" kind="course" />);
  it("hides the small header Register button on phones", () => {
    expect(out).toMatch(/<div class="hidden md:block">\s*<[a-z]+[^>]*>[^<]*Register/);
  });
  it("wraps the WhatsApp bubble and the bottom bar so they wait for the hero to leave", () => {
    expect(out.match(/data-phone-hidden="true"/g)).toHaveLength(2);
  });
  it("makes the WhatsApp bubble smaller on phones", () => {
    expect(out).toMatch(/aria-label="Chat on WhatsApp"[^>]*class="[^"]*\bh-12 w-12\b/);
  });
  it("fade hero highlights are plain lines on phones, a box from sm up", () => {
    const html = renderToStaticMarkup(<>{Hero({ data: { headline: "H", heroStyle: "fade", badges: [{ text: "One" }] }, register: { url: "https://x.com/r", label: "Join", closed: false } })}</>);
    expect(html).toContain("sm:rounded-landing");
    expect(html).toContain("sm:bg-white/10");
    expect(html).not.toMatch(/<ul class="[^"]*(?<![:\w-])bg-white\/10/);
  });
});
