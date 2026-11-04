import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ banners: [] as unknown[], batches: new Map<string, unknown>() }));

vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/mentorship/HeroSection", () => ({ default: () => <h1>Fake hero</h1> }));
vi.mock("@/components/mentorship/TrustBar", () => ({ default: () => null }));
vi.mock("@/components/mentorship/RecruitmentForm", () => ({ default: () => null }));
vi.mock("@/components/mentorship/TopMentorsStrip", () => ({ default: () => null }));
vi.mock("@/components/mentorship/MentorCard", () => ({ default: () => null, ComingSoonCard: () => null }));
vi.mock("@/lib/data/mentors", () => ({ getPublishedMentors: async () => [] }));
vi.mock("@/lib/data/mentor-reviews", () => ({ getMentorReviewSummaries: async () => ({}) }));
vi.mock("@/lib/data/marketing", () => ({ getActiveBanners: async (slot: string) => (slot === "footer" ? h.banners : []) }));
vi.mock("@/lib/data/landing-website", () => ({ getOpenLiveBatches: async () => h.batches }));

import MentorshipPage from "@/app/mentorship/page";

beforeEach(() => {
  h.banners = [];
  h.batches = new Map();
});

describe("mentorship page", () => {
  it("shows the admin Footer banner as a Featured promo", async () => {
    h.banners = [{ id: "f1", slot: "footer", imageUrl: null, headline: "Fake Course Promo", ctaText: "See it", ctaLink: "/courses/fake" }];
    render(await MentorshipPage());
    expect(screen.getByRole("region", { name: "Featured: Fake Course Promo" })).toBeTruthy();
  });

  it("falls back to an open course batch", async () => {
    h.batches = new Map([["c1", { courseId: "c1", slug: "fake", title: "Fake Batch", startsOn: "", href: "/e/fake?src=website" }]]);
    render(await MentorshipPage());
    expect(screen.getByRole("region", { name: "Featured: Fake Batch" })).toBeTruthy();
  });

  it("no promo box when there is nothing to show", async () => {
    render(await MentorshipPage());
    expect(screen.queryByRole("region", { name: /^Featured/ })).toBeNull();
  });
});

describe("mentorship hero phone buttons", () => {
  const src = readFileSync("src/components/mentorship/HeroSection.tsx", "utf8");
  const mobile = src.slice(src.indexOf("function MobileCTAs"), src.indexOf("function DesktopCTAs"));

  it("are at least 44px tall", () => {
    expect((mobile.match(/minHeight: 48/g) ?? []).length).toBe(2);
  });

  it("use readable text, not 10px", () => {
    expect(mobile).not.toMatch(/fontSize: "10px"/);
  });
});
