import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  enrollment: null as null | Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@/lib/data/lms", () => ({
  getCourseBySlug: async () => ({ id: "c1", slug: "ppc", title: "PPC Course", isPublished: true, pricePkr: 100, type: "course", tagline: null, description: null, bannerUrl: null, level: null, outcomes: [], mentorName: null, mentorAvatarUrl: null, mentorTitle: null, publicVideoUrl: null, durationLabel: null, timings: null }),
  getEnrollment: async () => h.enrollment,
  getCurriculum: async () => [],
  getLessonForStudent: async () => { throw new Error("must not be reached while the portal is closed"); },
  getQuizQuestions: async () => [],
  getQuizAttempts: async () => [],
}));
vi.mock("@/lib/data/notes", () => ({ getLessonNote: async () => null }));
vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing/MarketingFooter", () => ({ MarketingFooter: () => null }));
vi.mock("@/components/courses/CurriculumAccordion", () => ({ CurriculumAccordion: () => null }));
vi.mock("@/components/courses/EnrollCta", () => ({
  EnrollCta: ({ status, signedIn }: { status: string | null; signedIn: boolean }) => <div data-testid="cta">{`${signedIn ? "in" : "out"}:${status ?? "none"}`}</div>,
}));

import LessonPage from "@/app/portal/[slug]/lessons/[lessonId]/page";
import CourseDetailPage from "@/app/courses/[slug]/page";

beforeEach(() => { h.user = { id: "u1" }; h.enrollment = null; });

describe("/portal/[slug]/lessons/[lessonId] with a closed portal", () => {
  it("shows the portal_closed screen instead of redirecting", async () => {
    h.enrollment = { status: "active", portal_open: false, payment_shortfall_pkr: null };
    render(await LessonPage({ params: { slug: "ppc", lessonId: "l1" } }));
    expect(screen.getByRole("heading", { name: "Your portal opens after your batch." })).toBeTruthy();
  });
  it("still redirects a student who is not enrolled", async () => {
    await expect(LessonPage({ params: { slug: "ppc", lessonId: "l1" } })).rejects.toThrow("REDIRECT:/courses");
  });
});

describe("/courses/[slug] passes the right CTA state", () => {
  const cta = async () => {
    render(await CourseDetailPage({ params: Promise.resolve({ slug: "ppc" }) }));
    return screen.getByTestId("cta").textContent;
  };
  it("active enrollment with a closed portal -> portal_closed", async () => {
    h.enrollment = { status: "active", portal_open: false };
    expect(await cta()).toBe("in:portal_closed");
  });
  it("active enrollment with an open portal -> active", async () => {
    h.enrollment = { status: "active", portal_open: true };
    expect(await cta()).toBe("in:active");
  });
  it("other statuses pass through", async () => {
    h.enrollment = { status: "pending", portal_open: false };
    expect(await cta()).toBe("in:pending");
  });
  it("no enrollment -> none", async () => {
    expect(await cta()).toBe("in:none");
  });
});
