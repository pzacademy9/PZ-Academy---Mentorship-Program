import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const banners: Record<string, unknown[]> = { hero: [], mid_page: [] };
let batches = new Map<string, unknown>();

vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/lib/data/marketing", () => ({
  getActiveBanners: async (slot: string) => banners[slot] ?? [],
  getFeaturedItems: async () => [],
}));
vi.mock("@/lib/data/landing-website", () => ({ getOpenLiveBatches: async () => batches }));
vi.mock("@/lib/data/lms", () => ({ getPublishedCourses: async () => [] }));
vi.mock("@/lib/data/mentors", () => ({ getPublishedMentors: async () => [] }));

import HomePage from "@/app/page";

beforeEach(() => {
  banners.hero = [];
  banners.mid_page = [];
  batches = new Map();
});

describe("home page funnel", () => {
  it("offers four paths in ladder order, cheapest first", async () => {
    render(await HomePage());
    const paths = screen.getByRole("region", { name: /find your program/i });
    const hrefs = within(paths).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/webinars", "/workshops", "/courses", "/mentorship#mentors"]);
  });

  it("hero main button leads to the path chooser, second to free webinars", async () => {
    render(await HomePage());
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(within(hero).getByRole("link", { name: /find your program/i }).getAttribute("href")).toBe("#paths");
    expect(within(hero).getByRole("link", { name: /free webinars/i }).getAttribute("href")).toBe("/webinars");
  });

  it("never sends students to the mentor job form", async () => {
    const { container } = render(await HomePage());
    expect(container.innerHTML).not.toContain("type=mentor");
  });

  it("shows the admin mid-page banner as a Featured promo", async () => {
    banners.mid_page = [{ id: "m1", slot: "mid_page", imageUrl: null, headline: "Fake Promo Headline", ctaText: "Go now", ctaLink: "/courses/fake" }];
    render(await HomePage());
    expect(screen.getByRole("heading", { name: "Fake Promo Headline" })).toBeTruthy();
    expect(screen.getByRole("region", { name: /^Featured/ })).toBeTruthy();
  });

  it("shows no promo box when no mid-page banner is set", async () => {
    render(await HomePage());
    expect(screen.queryByRole("region", { name: /^Featured/ })).toBeNull();
  });

  it("reviews are readable on a phone, not only on wide screens", async () => {
    render(await HomePage());
    const reviews = screen.getByRole("region", { name: /what students say/i });
    expect(reviews.className).not.toMatch(/hidden/);
  });

  it("ignores an unsafe hero banner link and keeps the normal button", async () => {
    banners.hero = [{ id: "h1", slot: "hero", imageUrl: null, headline: "Fake Hero", ctaText: "Click", ctaLink: "javascript:alert(1)" }];
    const { container } = render(await HomePage());
    expect(container.innerHTML).not.toContain("javascript:");
    expect(screen.getAllByRole("link", { name: /find your program/i }).length).toBeGreaterThan(0);
  });

  it("has a main landmark", async () => {
    render(await HomePage());
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("uses the shared footer and has no dead links", async () => {
    const { container } = render(await HomePage());
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /WhatsApp/ }).length).toBeGreaterThan(0);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("#");
  });
});
