import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { stickyEnrollAction } from "@/lib/marketing/sticky-cta";
import { EnrollCta, type EnrollCtaStatus } from "@/components/courses/EnrollCta";

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
  it.each([null, "reserved", "rejected", "expired", "active", "pending", "portal_closed"] as (EnrollCtaStatus | null)[])(
    "agrees with the full enroll box for status %s",
    (status) => {
      for (const signedIn of [true, false]) {
        const { container, unmount } = render(<EnrollCta signedIn={signedIn} slug="s" status={status} ctaVerb="Enroll" />);
        const boxLink = container.querySelector("a");
        const action = stickyEnrollAction({ ...base, signedIn, status });
        if (boxLink && boxLink.getAttribute("href") !== "/portal/s") {
          expect(action).toEqual({ href: boxLink.getAttribute("href"), label: boxLink.textContent?.trim() });
        } else {
          expect(action).toBeNull();
        }
        unmount();
      }
    },
  );

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

  it("leaves room after the footer so the bar never hides content", async () => {
    const { container } = await renderPage();
    const spacer = container.querySelector("[data-enroll-bar-spacer]")!;
    expect(spacer.className).toMatch(/lg:hidden/);
    expect(spacer.className).toMatch(/h-28/);
  });

  it("no bar for a student who is already enrolled", async () => {
    h.user = { id: "u1" };
    h.enrollment = { status: "active", portal_open: true };
    await renderPage();
    expect(bar()).toBeNull();
    expect(document.querySelector("[data-enroll-bar-spacer]")).toBeNull();
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

  it("never promotes this course even through a link with a slash, query or full address", async () => {
    h.banners = [
      { id: "b1", slot: "mid_page", imageUrl: null, headline: "Self 1", ctaText: "Go", ctaLink: "/courses/fake-course/" },
      { id: "b2", slot: "mid_page", imageUrl: null, headline: "Self 2", ctaText: "Go", ctaLink: "https://example.com/courses/fake-course?utm=x" },
    ];
    await renderPage();
    expect(screen.queryByRole("region", { name: /^Featured/ })).toBeNull();
  });

  it("falls back to another course's open batch", async () => {
    h.batches = new Map([["c2", { courseId: "c2", slug: "other", title: "Other Batch", startsOn: "5 Dec", href: "/e/other?src=website" }]]);
    await renderPage();
    expect(screen.getByRole("region", { name: "Featured: Other Batch" })).toBeTruthy();
  });
});
