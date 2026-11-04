import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { stickyEnrollAction } from "@/lib/marketing/sticky-cta";

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  enrollment: null as null | Record<string, unknown>,
  banners: [] as unknown[],
  batches: new Map<string, unknown>(),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@/lib/data/lms", () => ({
  getCourseBySlug: async () => ({ id: "c1", slug: "fake-course", title: "Fake Course", isPublished: true, pricePkr: 4500, type: "course", tagline: null, description: null, bannerUrl: null, level: null, outcomes: [], mentorName: null, mentorAvatarUrl: null, mentorTitle: null, publicVideoUrl: null, durationLabel: null, timings: null }),
  getEnrollment: async () => h.enrollment,
  getCurriculum: async () => [],
}));
vi.mock("@/lib/data/marketing", () => ({ getActiveBanners: async (slot: string) => (slot === "mid_page" ? h.banners : []) }));
vi.mock("@/lib/data/landing-website", () => ({
  getOpenLiveBatches: async () => h.batches,
  getOpenLiveBatch: async (id: string) => h.batches.get(id) ?? null,
}));
vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing/MarketingFooter", () => ({ MarketingFooter: () => null }));
vi.mock("@/components/courses/CurriculumAccordion", () => ({ CurriculumAccordion: () => null }));

import CourseDetailPage from "@/app/courses/[slug]/page";

const renderPage = async () => render(await CourseDetailPage({ params: Promise.resolve({ slug: "fake-course" }) }));
const bar = () => screen.queryByRole("region", { name: /enroll bar/i });

beforeEach(() => {
  h.user = null;
  h.enrollment = null;
  h.banners = [];
  h.batches = new Map();
});

describe("stickyEnrollAction", () => {
  const base = { slug: "s", ctaVerb: "Enroll" as const };
  it("signed out: log in first, then come back", () => {
    expect(stickyEnrollAction({ ...base, signedIn: false, status: null })).toEqual({ href: "/login?returnUrl=/courses/s", label: "Log In to Enroll" });
  });
  it("signed in, not enrolled: enroll now", () => {
    expect(stickyEnrollAction({ ...base, signedIn: true, status: null })).toEqual({ href: "/enroll/s", label: "Enroll Now" });
  });
  it("seat reserved: finish paying", () => {
    expect(stickyEnrollAction({ ...base, signedIn: true, status: "reserved" })).toEqual({ href: "/enroll/s", label: "Complete Payment" });
  });
  it("already enrolled or waiting: no bar", () => {
    for (const status of ["active", "pending", "portal_closed"] as const) {
      expect(stickyEnrollAction({ ...base, signedIn: true, status })).toBeNull();
    }
  });
  it("uses the program's own verb", () => {
    expect(stickyEnrollAction({ slug: "w", ctaVerb: "Register", signedIn: true, status: null })?.label).toBe("Register Now");
  });
});

describe("course page on a phone", () => {
  it("shows a bottom bar with the price and the main button, phones only", async () => {
    await renderPage();
    const b = bar()!;
    expect(b.className).toMatch(/lg:hidden/);
    expect(b.className).toMatch(/fixed/);
    expect(b.textContent).toContain("PKR 4,500");
    const link = within(b).getByRole("link", { name: "Log In to Enroll" });
    expect(link.getAttribute("href")).toBe("/login?returnUrl=/courses/fake-course");
    expect(link.className).toMatch(/min-h-11/);
  });

  it("leaves room at the bottom so the bar never hides content", async () => {
    await renderPage();
    expect(screen.getByRole("main").className).toMatch(/pb-28/);
  });

  it("no bar for a student who is already enrolled", async () => {
    h.user = { id: "u1" };
    h.enrollment = { status: "active", portal_open: true };
    await renderPage();
    expect(bar()).toBeNull();
    expect(screen.getByRole("main").className).not.toMatch(/pb-28/);
  });

  it("the full enroll box can be jumped to", async () => {
    await renderPage();
    expect(document.getElementById("enroll")).not.toBeNull();
  });
});

describe("course page next-step promo", () => {
  it("shows the admin Mid Page banner as Featured", async () => {
    h.banners = [{ id: "b1", slot: "mid_page", imageUrl: null, headline: "Fake Next Program", ctaText: "See it", ctaLink: "/courses/other" }];
    await renderPage();
    expect(screen.getByRole("region", { name: "Featured: Fake Next Program" })).toBeTruthy();
  });

  it("never promotes this same course", async () => {
    h.banners = [{ id: "b1", slot: "mid_page", imageUrl: null, headline: "Self", ctaText: "Go", ctaLink: "/courses/fake-course" }];
    h.batches = new Map([["c1", { courseId: "c1", slug: "fake", title: "This Course Batch", startsOn: "", href: "/e/fake?src=website" }]]);
    await renderPage();
    expect(screen.queryByRole("region", { name: /^Featured/ })).toBeNull();
  });

  it("falls back to another course's open batch", async () => {
    h.batches = new Map([["c2", { courseId: "c2", slug: "other", title: "Other Batch", startsOn: "5 Dec", href: "/e/other?src=website" }]]);
    await renderPage();
    expect(screen.getByRole("region", { name: "Featured: Other Batch" })).toBeTruthy();
  });
});
