import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  enrollment: null as null | Record<string, unknown>,
  lessons: [{ id: "l1" }] as unknown[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@/lib/data/lms", () => ({
  getCourseBySlug: async () => ({ id: "c1", slug: "ppc", title: "PPC Course", isPublished: true, pricePkr: 100 }),
  getEnrollment: async () => h.enrollment,
  getOrderedLessons: async () => h.lessons,
  resumeLessonId: (l: { id: string }[]) => l[0]?.id ?? null,
}));

import { EnrollmentStatusScreen } from "@/components/lms/EnrollmentStatusScreen";
import { EnrollCta } from "@/components/courses/EnrollCta";
import PortalEntryPage from "@/app/portal/[slug]/page";
import EnrollPage from "@/app/enroll/[slug]/page";

const closed = { status: "active", portal_open: false, payment_shortfall_pkr: null };
const open = { status: "active", portal_open: true, payment_shortfall_pkr: null };

beforeEach(() => {
  h.user = { id: "u1" };
  h.enrollment = null;
});

describe("EnrollmentStatusScreen portal_closed", () => {
  it("shows the heading, the course title, the email and bell note and a back link", () => {
    render(<EnrollmentStatusScreen variant="portal_closed" courseTitle="PPC Course" />);
    expect(screen.getByRole("heading", { name: "Your portal opens after your batch." })).toBeTruthy();
    expect(screen.getByText("PPC Course")).toBeTruthy();
    expect(screen.getByText(/email you the link and show a bell notice/i)).toBeTruthy();
    const back = screen.getByRole("link", { name: /back to my courses/i });
    expect(back.getAttribute("href")).toBe("/dashboard/courses");
  });
});

describe("/portal/[slug]", () => {
  it("renders the portal_closed screen for an active enrollment with a closed portal (no redirect)", async () => {
    h.enrollment = closed;
    const ui = await PortalEntryPage({ params: { slug: "ppc" } });
    render(ui);
    expect(screen.getByText("Your portal opens after your batch.")).toBeTruthy();
  });

  it("still redirects an open portal to the resume lesson", async () => {
    h.enrollment = open;
    await expect(PortalEntryPage({ params: { slug: "ppc" } })).rejects.toThrow("REDIRECT:/portal/ppc/lessons/l1");
  });

  it("still redirects a non-enrolled student to /courses", async () => {
    h.enrollment = null;
    await expect(PortalEntryPage({ params: { slug: "ppc" } })).rejects.toThrow("REDIRECT:/courses");
  });

  it("still shows the pending screen for a pending enrollment", async () => {
    h.enrollment = { status: "pending", portal_open: false, payment_shortfall_pkr: null };
    render(await PortalEntryPage({ params: { slug: "ppc" } }));
    expect(screen.getByText("Awaiting Verification")).toBeTruthy();
  });
});

describe("/enroll/[slug] with a closed portal", () => {
  it("redirects to /portal/[slug] only (which renders the screen, so no loop)", async () => {
    h.enrollment = closed;
    await expect(EnrollPage({ params: Promise.resolve({ slug: "ppc" }) })).rejects.toThrow("REDIRECT:/portal/ppc");
  });
});

describe("EnrollCta", () => {
  it("portal_closed shows the closed note and no Enroll button or link", () => {
    render(<EnrollCta signedIn slug="ppc" status="portal_closed" ctaVerb="Enroll" />);
    expect(screen.getByRole("button", { name: "Opens after your batch" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/enroll/i)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("not enrolled still shows Enroll Now", () => {
    render(<EnrollCta signedIn slug="ppc" status={null} ctaVerb="Enroll" />);
    expect(screen.getByRole("link", { name: "Enroll Now" })).toBeTruthy();
  });
});
