import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

const data: { courses: CourseCardData[]; banners: unknown[]; batches: Map<string, unknown> } = {
  courses: [],
  banners: [],
  batches: new Map(),
};

vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/lib/data/lms", () => ({ getPublishedCourses: async () => data.courses }));
vi.mock("@/lib/data/marketing", () => ({ getActiveBanners: async (slot: string) => (slot === "sidebar" ? data.banners : []) }));
vi.mock("@/lib/data/landing-website", () => ({ getOpenLiveBatches: async () => data.batches }));

import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { WebinarGrid } from "@/components/marketing/WebinarGrid";
import { CourseCard } from "@/components/marketing/CourseCard";
import CoursesPage from "@/app/courses/page";
import WorkshopsPage from "@/app/workshops/page";
import WebinarsPage from "@/app/webinars/page";

const card = (n: number, extra: Partial<CourseCardData> = {}): CourseCardData => ({
  id: `c${n}`, slug: `fake-${n}`, title: `Fake Program ${n}`, type: "course", status: "open", tagline: null,
  thumbnailUrl: null, level: null, durationLabel: null, pricePkr: 1000, mentorName: "Fake Mentor",
  mentorTitle: null, mentorAvatarUrl: null, publicVideoUrl: null, ...extra,
});
const promo = { headline: "Fake Promo", detail: null, ctaText: "See it", href: "/e/promo", imageUrl: null };
const promoRegion = () => screen.queryByRole("article", { name: /^Featured/ });

beforeEach(() => {
  data.courses = [];
  data.banners = [];
  data.batches = new Map();
});

describe("CourseCatalogGrid", () => {
  it("puts the promo card after the third program", () => {
    const { container } = render(<CourseCatalogGrid courses={[1, 2, 3, 4].map((n) => card(n))} promo={promo} />);
    const items = Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    expect(items).toEqual(["c1", "c2", "c3", "promo", "c4"]);
  });

  it("puts the promo last when there are fewer than three programs", () => {
    const { container } = render(<CourseCatalogGrid courses={[card(1)]} promo={promo} />);
    const items = Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    expect(items).toEqual(["c1", "promo"]);
  });

  it("hides the promo while the visitor is searching", () => {
    render(<CourseCatalogGrid courses={[card(1), card(2)]} promo={promo} />);
    expect(promoRegion()).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: /search/i }), { target: { value: "Program 1" } });
    expect(promoRegion()).toBeNull();
  });

  it("a search with no match hides the promo and says so", () => {
    render(<CourseCatalogGrid courses={[card(1)]} promo={promo} />);
    fireEvent.change(screen.getByRole("searchbox", { name: /search/i }), { target: { value: "zzz" } });
    expect(promoRegion()).toBeNull();
    expect(screen.getByText(/no courses match your search/i)).toBeTruthy();
  });

  it("an empty catalog points to the next thing to do, not a dead end", () => {
    render(<CourseCatalogGrid courses={[]} noun="Workshop" emptyNext={{ label: "Watch a free webinar", href: "/webinars" }} />);
    expect(screen.getByText(/no workshops are open right now/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /watch a free webinar/i }).getAttribute("href")).toBe("/webinars");
  });
});

describe("CourseCard", () => {
  it("View Details is a big enough tap target", () => {
    render(<CourseCard course={card(1)} />);
    expect(screen.getByRole("link", { name: /view details/i }).className).toMatch(/min-h-11/);
  });
});

describe("WebinarGrid", () => {
  const webinars = [card(1, { type: "webinar", status: "open" }), card(2, { type: "webinar", status: "closed" })];

  it("never shows a 'Date TBD' placeholder", () => {
    const { container } = render(<WebinarGrid webinars={webinars} />);
    expect(container.textContent).not.toMatch(/Date TBD/);
  });

  it("filter buttons are big, and say which one is on", () => {
    render(<WebinarGrid webinars={webinars} />);
    const all = screen.getByRole("button", { name: "All Webinars" });
    expect(all.className).toMatch(/min-h-11/);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(screen.getByRole("button", { name: "Past" }).getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
  });

  it("puts the promo card after the third webinar in the full list only", () => {
    const many = [1, 2, 3, 4].map((n) => card(n, { type: "webinar", status: n === 4 ? "closed" : "open" }));
    const { container } = render(<WebinarGrid webinars={many} promo={promo} />);
    const items = () => Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    expect(items()).toEqual(["c1", "c2", "c3", "promo", "c4"]);
    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(items()).toEqual(["c4"]);
    expect(promoRegion()).toBeNull();
  });

  it("puts the promo last when there are fewer than three webinars", () => {
    const { container } = render(<WebinarGrid webinars={webinars} promo={promo} />);
    expect(Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"))).toEqual(["c1", "c2", "promo"]);
  });
});

const heroOf = () => screen.getByRole("heading", { level: 1 }).closest("section")!;

describe("list pages", () => {
  it.each([
    ["Webinars", WebinarsPage, "/workshops"],
    ["Workshops", WorkshopsPage, "/courses"],
    ["Courses", CoursesPage, "/mentorship#mentors"],
  ] as const)("%s: short hero, and a next step up the ladder", async (_name, Page, next) => {
    data.courses = [card(1)];
    render(await Page());
    expect(heroOf().className).not.toMatch(/min-h-screen/);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
    const step = screen.getByRole("region", { name: /next step/i });
    expect(within(step).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(next);
  });

  it("Courses page hero is dark, so the white top menu stays readable", async () => {
    render(await CoursesPage());
    expect(heroOf().className).toMatch(/bg-pz-solid-deep/);
  });

  it("shows the admin Sidebar banner as a Featured card", async () => {
    data.courses = [card(1)];
    data.banners = [{ id: "b1", slot: "sidebar", imageUrl: null, headline: "Fake Sidebar Promo", ctaText: "Go", ctaLink: "/e/x" }];
    render(await WorkshopsPage());
    expect(screen.getByRole("article", { name: "Featured: Fake Sidebar Promo" })).toBeTruthy();
  });

  it("falls back to an open batch, but not one already listed on the page", async () => {
    data.courses = [card(1)];
    data.batches = new Map([
      ["c1", { courseId: "c1", slug: "fake-1", title: "Listed Batch", startsOn: "1 Dec", href: "/e/listed" }],
      ["c9", { courseId: "c9", slug: "other", title: "Other Batch", startsOn: "2 Dec", href: "/e/other" }],
    ]);
    render(await CoursesPage());
    expect(screen.getByRole("article", { name: "Featured: Other Batch" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Featured: Listed Batch" })).toBeNull();
  });

  it("an empty Workshops page sends people to free webinars", async () => {
    render(await WorkshopsPage());
    expect(screen.getAllByRole("link", { name: /free webinar/i }).some((a) => a.getAttribute("href") === "/webinars")).toBe(true);
  });

  it("every list page has a main landmark", async () => {
    for (const Page of [CoursesPage, WorkshopsPage, WebinarsPage]) {
      const { unmount } = render(await Page());
      expect(screen.getByRole("main")).toBeTruthy();
      unmount();
    }
  });
});
