import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { PricingCards } from "@/components/landing/sections/PricingCards";
import { MobileMenu } from "@/components/landing/MobileMenu";
import { Hero } from "@/components/landing/sections/Hero";

const register = { url: "https://x.com/r", label: "Register now", closed: false };

describe("PricingCards layout", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ name: `Plan ${i}`, price: "Rs 1", oldPrice: "", badge: "", features: "a" }));
  const { container } = render(<PricingCards data={{ items }} register={register} />);
  const track = container.querySelector(".snap-x") as HTMLElement;
  it("wraps at lg so six cards cannot overflow horizontally, and gives cards a basis", () => {
    expect(track.className).toContain("lg:flex-wrap");
    expect(track.className).toContain("lg:overflow-visible");
    expect((track.firstElementChild as HTMLElement).className).toContain("lg:basis-[300px]");
  });
  it("keeps the phone snap carousel with scroll padding so the first card is not flush left", () => {
    expect(track.className).toContain("overflow-x-auto");
    expect(track.className).toContain("scroll-px-4");
  });
});

describe("MobileMenu Escape", () => {
  it("closes on Escape and returns focus to the toggle", () => {
    render(<MobileMenu items={[{ id: "a", label: "About" }]} register={register} />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(toggle);
    expect(screen.getByRole("link", { name: "About" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "About" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open menu" }));
  });
});

describe("Hero image box", () => {
  it("reserves an aspect-ratio box around the image", () => {
    const { container } = render(<>{Hero({ data: { headline: "H", image: "https://pharmacozyme.com/a.jpg" }, register })}</>);
    const img = container.querySelector("img")!;
    expect(img.parentElement!.className).toContain("aspect-[3/2]");
  });
});

describe("solid-forest contrast", () => {
  it("never pairs bg-pz-solid-forest with the theme-flipping text-pz-on-primary", () => {
    for (const f of ["src/components/admin/landing/PublishSlot.tsx", "src/components/admin/landing/FieldInput.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/bg-pz-solid-forest[^"`]*text-pz-on-primary/);
    }
  });
});
