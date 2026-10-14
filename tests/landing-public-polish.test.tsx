import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { Hero } from "@/components/landing/sections/Hero";
import { FinalCta } from "@/components/landing/sections/FinalCta";
import { emptyContent, updateSectionData, updateSettings } from "@/lib/landing/content";
import { defaultSectionData } from "@/lib/landing/sections";

const register = { url: "https://x.com/r", label: "Join PPC", closed: false };

describe("section buttons follow the page's Register button text", () => {
  it("hero and closing buttons with no own text use settings.registerLabel", () => {
    render(<>{Hero({ data: { headline: "H", primaryCtaLabel: "" }, register })}{FinalCta({ data: { headline: "Ready", buttonLabel: "  " }, register })}</>);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "https://x.com/r");
    expect(links).toHaveLength(2);
    for (const a of links) expect(a.textContent?.trim()).toBe("Join PPC");
  });
  it("a section's own button text still wins", () => {
    render(<>{Hero({ data: { headline: "H", primaryCtaLabel: "Enroll today" }, register })}</>);
    expect(screen.getByRole("link", { name: "Enroll today" })).toBeTruthy();
  });
  it("new hero and closing sections start empty, so they follow the page setting", () => {
    expect(defaultSectionData("hero").primaryCtaLabel).toBe("");
    expect(defaultSectionData("final_cta").buttonLabel).toBe("");
  });
});

describe("hero picture frame", () => {
  it("puts the shadow on the frame (not clipped by overflow-hidden) and never crops the picture", () => {
    const { container } = render(<>{Hero({ data: { headline: "H", image: "https://pharmacozyme.com/a.jpg" }, register })}</>);
    const img = container.querySelector("img")!;
    const frame = img.parentElement!;
    expect(frame.className).toContain("aspect-[3/2]");
    expect(frame.className).toContain("overflow-hidden");
    expect(frame.className).toContain("shadow-landing-soft-lg");
    expect(img.className).not.toMatch(/shadow-/);
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
  });
});

describe("closed page notices", () => {
  it("announces 'Registration is closed' once, though every Register slot shows it", () => {
    let c = emptyContent("webinar");
    const hero = c.sections.find((s) => s.type === "hero")!;
    const pricing = c.sections.find((s) => s.type === "pricing_cards")!;
    const fin = c.sections.find((s) => s.type === "final_cta")!;
    c = updateSectionData(c, hero.id, { headline: "H" });
    c = updateSectionData(c, pricing.id, { items: [{ name: "Pro", price: "PKR 399", oldPrice: "", badge: "", features: "" }] });
    c = updateSectionData(c, fin.id, { headline: "Ready" });
    c = updateSettings(c, { registerUrl: "https://pharmacozyme.com/register" });
    render(<LandingRenderer content={c} status="closed" kind="webinar" />);
    expect(screen.getAllByText("Registration is closed").length).toBeGreaterThan(2);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
