import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CourseCard } from "@/lib/data/lms";

const data: {
  banners: Record<string, unknown[]>;
  featured: unknown[];
  batches: Map<string, unknown>;
  courses: CourseCard[];
  mentors: unknown[] | Error;
} = { banners: {}, featured: [], batches: new Map(), courses: [], mentors: [] };

vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/lib/data/marketing", () => ({
  getActiveBanners: async (slot: string) => data.banners[slot] ?? [],
  getFeaturedItems: async () => data.featured,
}));
vi.mock("@/lib/data/landing-website", () => ({ getOpenLiveBatches: async () => data.batches }));
vi.mock("@/lib/data/lms", () => ({ getPublishedCourses: async () => data.courses }));
vi.mock("@/lib/data/mentors", () => ({
  getPublishedMentors: async () => {
    if (data.mentors instanceof Error) throw data.mentors;
    return data.mentors;
  },
}));

import HomePage from "@/app/page";
import { QuickQuiz } from "@/components/marketing/home/QuickQuiz";

const course = (id: string, over: Partial<CourseCard> = {}): CourseCard => ({
  id, slug: `slug-${id}`, title: `Fake Course ${id}`, type: "course", status: "open", tagline: null,
  thumbnailUrl: null, level: null, durationLabel: null, pricePkr: 1000, mentorName: null, mentorTitle: null,
  mentorAvatarUrl: null, publicVideoUrl: null, ...over,
});

beforeEach(() => {
  data.banners = {};
  data.featured = [];
  data.batches = new Map();
  data.courses = [];
  data.mentors = [];
});
afterEach(cleanup);

const hero = () => screen.getByRole("heading", { level: 1 }).closest("section")!;

describe("home page hero", () => {
  it("shows the next open batch with its start date and register link", async () => {
    data.batches = new Map([["c1", { courseId: "c1", slug: "s1", title: "Fake Batch", startsOn: "30 October 2026", href: "/e/s1?src=website" }]]);
    render(await HomePage());
    expect(within(hero()).getByText(/starts 30 October 2026/i)).toBeTruthy();
    expect(within(hero()).getByRole("link", { name: /fake batch/i }).getAttribute("href")).toBe("/e/s1?src=website");
  });

  it("shows no start date when no batch is open", async () => {
    render(await HomePage());
    expect(within(hero()).queryByText(/starts/i)).toBeNull();
  });
});

describe("home page programs", () => {
  it("lists real courses and workshops, never webinars, at most three", async () => {
    data.courses = [
      course("a"), course("b", { type: "workshop" }), course("c", { type: "webinar" }), course("d"), course("e"),
    ];
    render(await HomePage());
    const region = screen.getByRole("region", { name: /popular programs/i });
    expect(within(region).getAllByRole("article")).toHaveLength(3);
    expect(within(region).queryByText("Fake Course c")).toBeNull();
    expect(within(region).getByText("Fake Course a")).toBeTruthy();
  });

  it("admin featured items come first", async () => {
    data.courses = [course("a")];
    data.featured = [{ title: "Fake Featured", desc: "", badge: "Course", duration: null, href: "/courses/ff", grad: "" }];
    render(await HomePage());
    const region = screen.getByRole("region", { name: /popular programs/i });
    expect(within(region).getByText("Fake Featured")).toBeTruthy();
    expect(within(region).queryByText("Fake Course a")).toBeNull();
  });

  it("hides the section when nothing is published or featured", async () => {
    render(await HomePage());
    expect(screen.queryByRole("region", { name: /popular programs/i })).toBeNull();
  });

  it("never shows made-up enrolment numbers", async () => {
    const { container } = render(await HomePage());
    expect(container.textContent).not.toMatch(/240\+|500\+|thousands/i);
  });
});

describe("home page mentors", () => {
  it("shows mentor faces linking to each profile and to all mentors", async () => {
    data.mentors = [{ id: "m1", slug: "fake-mentor", name: "Dr Fake Mentor", title: "Fake Pharmacist", photo: "" }];
    render(await HomePage());
    const region = screen.getByRole("region", { name: /meet your mentors/i });
    expect(within(region).getByRole("link", { name: /dr fake mentor/i }).getAttribute("href")).toBe("/mentorship/mentors/fake-mentor");
    expect(within(region).getByRole("link", { name: /see all mentors/i }).getAttribute("href")).toBe("/mentorship#mentors");
  });

  it("hides the strip when there are no mentors", async () => {
    render(await HomePage());
    expect(screen.queryByRole("region", { name: /meet your mentors/i })).toBeNull();
  });

  it("a failed mentor read does not break the page", async () => {
    data.mentors = new Error("fake failure");
    render(await HomePage());
    expect(screen.getByRole("main")).toBeTruthy();
  });
});

describe("home page fun and proof", () => {
  it("has a quick quiz and a labelled numbers strip", async () => {
    render(await HomePage());
    expect(screen.getByRole("region", { name: /quick quiz/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /pz academy in numbers/i })).toBeTruthy();
  });
});

describe("QuickQuiz", () => {
  const questions = [
    { q: "Fake question one?", options: ["Alpha", "Beta", "Gamma"], answer: 1, why: "Because beta." },
    { q: "Fake question two?", options: ["Delta", "Echo"], answer: 0, why: "Because delta." },
  ];

  it("a right answer says correct and gives points", () => {
    render(<QuickQuiz questions={questions} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByRole("status").textContent).toMatch(/correct/i);
    expect(screen.getByRole("status").textContent).toMatch(/\+100/);
    expect(screen.getByText("Because beta.")).toBeTruthy();
  });

  it("a wrong answer shows the right one", () => {
    render(<QuickQuiz questions={questions} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.getByRole("status").textContent).toMatch(/not quite/i);
    expect(screen.getByRole("status").textContent).toMatch(/Beta/);
  });

  it("locks the answers once one is picked", () => {
    render(<QuickQuiz questions={questions} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect((screen.getByRole("button", { name: "Gamma" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves to the next question and wraps around", () => {
    render(<QuickQuiz questions={questions} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    expect(screen.getByText("Fake question two?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delta" }));
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    expect(screen.getByText("Fake question one?")).toBeTruthy();
  });

  it("answer buttons are big tap targets", () => {
    render(<QuickQuiz questions={questions} />);
    expect(screen.getByRole("button", { name: "Alpha" }).className).toMatch(/min-h-11/);
  });
});
