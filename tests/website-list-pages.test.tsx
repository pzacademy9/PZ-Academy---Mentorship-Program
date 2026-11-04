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
  mentorTitle: null, mentorAvatarUrl: null, publicVideoUrl: null, timings: null, ...extra,
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

describe("CourseCatalogGrid (Stitch list layout)", () => {
  it("counts what is listed, and the count follows the search", () => {
    render(<CourseCatalogGrid courses={[card(1), card(2)]} />);
    expect(screen.getByText("2 courses available")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: /search/i }), { target: { value: "Program 1" } });
    expect(screen.getByText("1 course available")).toBeTruthy();
  });

  it("puts the search box inside the dark hero when one is given", () => {
    render(<CourseCatalogGrid courses={[card(1)]} hero={{ kicker: "Fake Kicker", title: "Fake Title", text: "Fake text" }} />);
    const hero = screen.getByRole("heading", { level: 1, name: "Fake Title" }).closest("section")!;
    expect(hero.className).toMatch(/bg-pz-solid-deep/);
    expect(within(hero).getByRole("searchbox", { name: /search courses/i })).toBeTruthy();
  });

  it("the search button only moves focus to the results, it never reloads the page", () => {
    render(<CourseCatalogGrid courses={[card(1)]} hero={{ kicker: "K", title: "T", text: "x" }} />);
    const btn = screen.getByRole("button", { name: /search/i });
    expect(btn.getAttribute("type")).toBe("button");
  });
});

describe("CourseCard", () => {
  it("View Details is a big enough tap target", () => {
    render(<CourseCard course={card(1)} />);
    expect(screen.getByRole("link", { name: /view details/i }).className).toMatch(/min-h-11/);
  });

  it("list cards show the time text and a full-width View details button", () => {
    render(<CourseCard course={card(1, { type: "workshop", timings: "Sat 30 Nov, 7 PM PKT" })} layout="list" />);
    expect(screen.getByText("Sat 30 Nov, 7 PM PKT")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view details/i }).className).toMatch(/w-full/);
  });

  it("list cards show when an open batch starts", () => {
    render(<CourseCard course={card(1, { liveBatch: { startsOn: "30 Nov", href: "/e/x" } })} layout="list" />);
    expect(screen.getByText("Live batch open")).toBeTruthy();
    expect(screen.getByText("Starts 30 Nov")).toBeTruthy();
  });
});

describe("WebinarGrid", () => {
  const webinars = [card(1, { type: "webinar", status: "open" }), card(2, { type: "webinar", status: "closed" })];

  it("never shows a 'Date TBD' placeholder", () => {
    const { container } = render(<WebinarGrid webinars={webinars} />);
    expect(container.textContent).not.toMatch(/Date TBD/);
  });

  it("filter buttons are big, say which one is on, and count each group", () => {
    render(<WebinarGrid webinars={webinars} />);
    const all = screen.getByRole("button", { name: /^All/ });
    expect(all.className).toMatch(/min-h-11/);
    expect(all.textContent).toMatch(/2/);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Recorded/ }));
    expect(screen.getByRole("button", { name: /^Recorded/ }).getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
  });

  it("Upcoming shows only open webinars, Recorded only past ones", () => {
    const { container } = render(<WebinarGrid webinars={webinars} />);
    const items = () => Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    fireEvent.click(screen.getByRole("button", { name: /^Upcoming/ }));
    expect(items()).toEqual(["c1"]);
    fireEvent.click(screen.getByRole("button", { name: /^Recorded/ }));
    expect(items()).toEqual(["c2"]);
  });

  it("a published webinar that is neither open nor closed still shows, as a recording", () => {
    const { container } = render(<WebinarGrid webinars={[card(5, { type: "webinar", status: "archived" })]} />);
    expect(Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"))).toEqual(["c5"]);
    expect(screen.getByRole("region", { name: /recorded sessions/i })).toBeTruthy();
  });

  it("shows upcoming and recorded webinars in their own sections", () => {
    render(<WebinarGrid webinars={webinars} />);
    const up = screen.getByRole("region", { name: /upcoming live webinars/i });
    const rec = screen.getByRole("region", { name: /recorded sessions/i });
    expect(within(up).getByText("Fake Program 1")).toBeTruthy();
    expect(within(rec).getByText("Fake Program 2")).toBeTruthy();
  });

  it("an upcoming webinar shows its time text and a register link", () => {
    render(<WebinarGrid webinars={[card(1, { type: "webinar", status: "open", pricePkr: 0, timings: "Sat 14 Dec, 8 PM PKT" })]} />);
    expect(screen.getByText("Sat 14 Dec, 8 PM PKT")).toBeTruthy();
    const reg = screen.getByRole("link", { name: /register free/i });
    expect(reg.getAttribute("href")).toBe("/courses/fake-1");
    expect(reg.className).toMatch(/min-h-11/);
  });

  it("a recording shows the YouTube picture and a watch link", () => {
    const { container } = render(
      <WebinarGrid webinars={[card(2, { type: "webinar", status: "closed", publicVideoUrl: "https://www.youtube.com/watch?v=abcDEF12345" })]} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg");
    const watch = screen.getByRole("link", { name: /watch recording/i });
    expect(watch.getAttribute("href")).toBe("/courses/fake-2");
    expect(watch.className).toMatch(/min-h-11/);
  });

  it("a recording without a YouTube link shows no broken picture", () => {
    const { container } = render(<WebinarGrid webinars={[card(2, { type: "webinar", status: "closed", publicVideoUrl: "javascript:alert(1)" })]} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("search finds webinars by title or speaker and says when nothing matches", () => {
    const { container } = render(
      <WebinarGrid webinars={[card(1, { type: "webinar", status: "open" }), card(2, { type: "webinar", status: "closed", mentorName: "Fake Speaker Two" })]} />,
    );
    const items = () => Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    fireEvent.change(screen.getByRole("searchbox", { name: /search webinars/i }), { target: { value: "speaker two" } });
    expect(items()).toEqual(["c2"]);
    fireEvent.change(screen.getByRole("searchbox", { name: /search webinars/i }), { target: { value: "zzz" } });
    expect(screen.getByText(/no webinars match/i)).toBeTruthy();
  });

  it("puts the promo card after the third recording, in the full list only", () => {
    const many = [1, 2, 3, 4].map((n) => card(n, { type: "webinar", status: "closed" }));
    const { container } = render(<WebinarGrid webinars={many} promo={promo} />);
    const items = () => Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"));
    expect(items()).toEqual(["c1", "c2", "c3", "promo", "c4"]);
    fireEvent.click(screen.getByRole("button", { name: /^Recorded/ }));
    expect(items()).toEqual(["c1", "c2", "c3", "c4"]);
    expect(promoRegion()).toBeNull();
  });

  it("puts the promo last when there are few recordings", () => {
    const { container } = render(<WebinarGrid webinars={webinars} promo={promo} />);
    expect(Array.from(container.querySelectorAll("[data-grid-item]")).map((el) => el.getAttribute("data-grid-item"))).toEqual(["c1", "c2", "promo"]);
  });

  it("still shows the promo when there are only upcoming webinars", () => {
    render(<WebinarGrid webinars={[card(1, { type: "webinar", status: "open" })]} promo={promo} />);
    expect(promoRegion()).toBeTruthy();
  });
});

describe("list cards never copy made-up design numbers", () => {
  it("no seats left, views, ratings or crossed-out prices", () => {
    const { container } = render(
      <>
        <CourseCatalogGrid courses={[card(1), card(2, { type: "workshop" })]} />
        <WebinarGrid webinars={[card(3, { type: "webinar", status: "open" }), card(4, { type: "webinar", status: "closed" })]} />
      </>,
    );
    expect(container.textContent).not.toMatch(/seats left|views|Top Rated|\d\.\d ★|refund/i);
    expect(container.querySelector(".line-through")).toBeNull();
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

  it("Courses page hero is the dark band from the design", async () => {
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

  it("Courses page keeps all six FAQs", async () => {
    render(await CoursesPage());
    const faq = screen.getByRole("region", { name: /frequently asked questions/i });
    expect(within(faq).getAllByRole("button", { expanded: false }).length).toBe(6);
  });

  it("Courses and Workshops show three 'why' cards", async () => {
    for (const Page of [CoursesPage, WorkshopsPage]) {
      const { unmount } = render(await Page());
      const why = screen.getByRole("region", { name: /^why/i });
      expect(within(why).getAllByRole("heading", { level: 3 }).length).toBe(3);
      unmount();
    }
  });

  it("Webinars page hero holds the filter and the search", async () => {
    data.courses = [card(1, { type: "webinar" })];
    render(await WebinarsPage());
    const hero = heroOf();
    expect(hero.className).toMatch(/bg-pz-solid-deep/);
    expect(within(hero).getByRole("searchbox", { name: /search webinars/i })).toBeTruthy();
    expect(within(hero).getByRole("button", { name: /^Upcoming/ })).toBeTruthy();
  });

  it("no list page shows made-up design numbers", async () => {
    for (const Page of [CoursesPage, WorkshopsPage, WebinarsPage]) {
      data.courses = [card(1)];
      const { container, unmount } = render(await Page());
      expect(container.textContent).not.toMatch(/1,400\+|100K\+|\d+ seats|refund|guarantee/i);
      unmount();
    }
  });

  it("every list page has a main landmark", async () => {
    for (const Page of [CoursesPage, WorkshopsPage, WebinarsPage]) {
      const { unmount } = render(await Page());
      expect(screen.getByRole("main")).toBeTruthy();
      unmount();
    }
  });
});
