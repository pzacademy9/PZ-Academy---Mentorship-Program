import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CourseDetail } from "@/lib/data/lms";

const h = vi.hoisted(() => ({
  course: null as unknown as Record<string, unknown>,
  batches: new Map<string, unknown>(),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/data/lms", () => ({
  getCourseBySlug: async () => h.course,
  getEnrollment: async () => null,
  getCurriculum: async () => [
    { moduleId: "m1", title: "Fake Module One", order: 1, lessons: [{ lessonId: "l1", title: "Fake Lesson", order: 1, contentType: "video", isFree: false, locked: true }] },
  ],
}));
vi.mock("@/lib/data/marketing", () => ({ getActiveBanners: async () => [] }));
vi.mock("@/lib/data/landing-website", () => ({ getOpenLiveBatches: async () => h.batches }));
vi.mock("@/components/marketing/MarketingNav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing/MarketingFooter", () => ({ MarketingFooter: () => null }));

import CourseDetailPage from "@/app/courses/[slug]/page";

const base = (over: Partial<CourseDetail> = {}): CourseDetail => ({
  id: "c1", slug: "fake-course", title: "Fake Dose Course", type: "course", status: "open",
  tagline: "A fake short line.", thumbnailUrl: null, level: "Beginner", durationLabel: "8 Weeks", pricePkr: 9000,
  mentorName: "Dr Fake Teacher", mentorTitle: "Fake Pharmacist", mentorAvatarUrl: null,
  publicVideoUrl: "https://www.youtube.com/watch?v=abcDEF12345", timings: "Sundays 7 PM PKT",
  description: "Fake description first line.\nFake second line.", bannerUrl: null,
  features: ["Fake feature one", "Fake feature two"], outcomes: ["Fake outcome one", "Fake outcome two"],
  registerUrl: null, mentorBio: "Fake teacher bio text.", faqs: [{ question: "Fake question?", answer: "Fake <b>answer</b>" }],
  isPublished: true, ...over,
});

const renderPage = async () => render(await CourseDetailPage({ params: Promise.resolve({ slug: "fake-course" }) }));
const hero = () => screen.getByRole("heading", { level: 1 }).closest("section")!;
const enrollBox = () => document.getElementById("enroll")!;

beforeEach(() => {
  h.course = base() as unknown as Record<string, unknown>;
  h.batches = new Map();
});

describe("course page hero (Stitch 'Mastering Dose Calculations')", () => {
  it("is a dark band with the title, short line and a way back to the list", async () => {
    await renderPage();
    expect(hero().className).toMatch(/bg-pz-solid-deep/);
    expect(within(hero()).getByText("A fake short line.")).toBeTruthy();
    const trail = within(hero()).getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getByRole("link", { name: "Courses" }).getAttribute("href")).toBe("/courses");
  });

  it("a workshop page points back to Workshops", async () => {
    h.course = base({ type: "workshop" }) as unknown as Record<string, unknown>;
    await renderPage();
    const trail = within(hero()).getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getByRole("link", { name: "Workshops" }).getAttribute("href")).toBe("/workshops");
  });

  it("shows the teacher and the four facts", async () => {
    await renderPage();
    expect(within(hero()).getByText("Dr Fake Teacher")).toBeTruthy();
    for (const t of ["8 Weeks", "Beginner", "Sundays 7 PM PKT"]) expect(within(hero()).getByText(t)).toBeTruthy();
    expect(within(hero()).getByText(/certificate/i)).toBeTruthy();
  });

  it("a webinar has no certificate fact", async () => {
    h.course = base({ type: "webinar" }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(within(hero()).queryByText(/certificate/i)).toBeNull();
  });

  it("says Live batch open when a batch is open", async () => {
    h.batches = new Map([["c1", { courseId: "c1", slug: "fake", title: "Fake Batch", startsOn: "30 Nov", href: "/e/fake" }]]);
    await renderPage();
    expect(within(hero()).getByText("Live batch open")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Live batch" })).toBeTruthy();
  });
});

describe("course page enroll box", () => {
  it("holds the preview video, the price and the enroll button", async () => {
    await renderPage();
    expect(enrollBox().querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube.com/embed/abcDEF12345");
    expect(within(enrollBox()).getByText("PKR 9,000")).toBeTruthy();
    expect(within(enrollBox()).getByRole("link", { name: "Log In to Enroll" })).toBeTruthy();
  });

  it("a free program says Free", async () => {
    h.course = base({ pricePkr: 0 }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(within(enrollBox()).getByText("Free")).toBeTruthy();
  });

  it("lists what is included from the course features", async () => {
    await renderPage();
    const list = within(enrollBox()).getByRole("list", { name: /this course includes/i });
    expect(within(list).getByText("Fake feature one")).toBeTruthy();
  });

  it("has a WhatsApp button that names this course", async () => {
    await renderPage();
    const wa = within(enrollBox()).getByRole("link", { name: /whatsapp/i });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/923700199429\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("Fake Dose Course");
    expect(wa.className).toMatch(/min-h-11/);
  });
});

describe("course page body", () => {
  it("shows the description, what you learn, the modules and the teacher bio", async () => {
    await renderPage();
    expect(screen.getByRole("region", { name: /about this course/i }).textContent).toContain("Fake second line.");
    expect(within(screen.getByRole("region", { name: /what you.ll learn/i })).getByText("Fake outcome one")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /course curriculum/i })).getByText("Fake Module One")).toBeTruthy();
    expect(screen.getByRole("region", { name: /meet your teacher/i }).textContent).toContain("Fake teacher bio text.");
  });

  it("shows a sample certificate with no made-up name", async () => {
    await renderPage();
    const cert = screen.getByRole("region", { name: /certificate/i });
    expect(cert.textContent).toContain("Your name here");
    expect(cert.textContent).toContain("Fake Dose Course");
  });

  it("a webinar shows no certificate section", async () => {
    h.course = base({ type: "webinar" }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(screen.queryByRole("region", { name: /certificate/i })).toBeNull();
  });

  it("shows the course's own questions as plain text, never as markup", async () => {
    const { container } = await renderPage();
    const faq = screen.getByRole("region", { name: /frequently asked questions/i });
    expect(within(faq).getByRole("button", { name: "Fake question?" })).toBeTruthy();
    expect(faq.textContent).toContain("Fake <b>answer</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("missing details hide their sections instead of showing empty boxes", async () => {
    h.course = { ...base(), description: null, mentorBio: null, faqs: undefined, features: undefined, outcomes: [] } as unknown as Record<string, unknown>;
    await renderPage();
    expect(screen.queryByRole("region", { name: /about this course/i })).toBeNull();
    expect(screen.queryByRole("region", { name: /what you.ll learn/i })).toBeNull();
    expect(screen.queryByRole("region", { name: /frequently asked questions/i })).toBeNull();
    expect(screen.queryByRole("list", { name: /includes/i })).toBeNull();
  });

  it("never copies made-up design numbers", async () => {
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/reviews|What Students Say|alumni|4\.9|refund|guarantee|seats left|% off/i);
    expect(container.querySelector(".line-through")).toBeNull();
  });
});

describe("course page follows the admin's section settings", () => {
  const order = () =>
    Array.from(document.querySelectorAll("[data-course-section]")).map((el) => el.getAttribute("data-course-section"));

  it("nothing set: the normal order", async () => {
    await renderPage();
    expect(order()).toEqual(["about", "learn", "curriculum", "teacher", "certificate", "faq"]);
  });

  it("uses the saved order, hides hidden sections and shows custom headings", async () => {
    h.course = base({
      pageSections: [
        { key: "faq", visible: true, title: "Fake custom questions" },
        { key: "about", visible: false },
        { key: "curriculum", visible: true },
      ],
    }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(order()).toEqual(["faq", "curriculum", "learn", "teacher", "certificate"]);
    expect(screen.getByRole("heading", { level: 2, name: "Fake custom questions" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /about this course/i })).toBeNull();
  });

  it("an uploaded certificate picture replaces the sample", async () => {
    h.course = base({ certificateImageUrl: "https://fake.example/cert.png" }) as unknown as Record<string, unknown>;
    await renderPage();
    const cert = screen.getByRole("region", { name: /certificate/i });
    const img = within(cert).getByRole("img");
    expect(img.getAttribute("src")).toBe("https://fake.example/cert.png");
    expect(img.getAttribute("alt")).toMatch(/certificate/i);
    expect(cert.textContent).not.toContain("Your name here");
  });

  it("a webinar never shows the certificate, even if one is uploaded", async () => {
    h.course = base({ type: "webinar", certificateImageUrl: "https://fake.example/cert.png" }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(screen.queryByRole("region", { name: /certificate/i })).toBeNull();
  });
});

describe("course page on small phones", () => {
  it("long words and names wrap inside their boxes instead of running off the screen", async () => {
    h.course = base({
      title: "Pharmacovigilanceandpharmacoepidemiologymasterclass",
      mentorName: "Dr Fakenamewithaverylongsurnameforlayouttesting",
      timings: "Saturdays and Sundays 7:00 PM to 9:30 PM Pakistan Standard Time",
    }) as unknown as Record<string, unknown>;
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/break-words/);
    for (const dd of Array.from(hero().querySelectorAll("dd"))) expect(dd.className).toMatch(/break-words/);
    const crumb = within(hero()).getByRole("navigation", { name: /breadcrumb/i });
    expect(crumb.querySelector("[aria-current]")!.className).toMatch(/min-w-0/);
  });
});


describe("course page real details", () => {
  const batch = {
    courseId: "c1", slug: "fake-batch", title: "Fake Batch", startsOn: "12 December 2099",
    startsAt: "2099-12-12T14:00:00.000Z", startsAtLabel: "Sat 12 December 2099, 7:00 pm PKT",
    seatsLeft: 6, earlyBird: { price: "PKR 7,000", was: "PKR 9,000", until: "1 December 2099" }, href: "/e/fake-batch?src=website",
  };
  it("shows seats left in the hero, and the batch strip with Early Bird and Add to calendar; the main price stays", async () => {
    h.batches = new Map([["c1", batch]]);
    await renderPage();
    expect(within(hero()).getByText("6 seats left")).toBeTruthy();
    const strip = screen.getByRole("region", { name: "Live batch" });
    expect(within(strip).getByText("Starts Sat 12 December 2099, 7:00 pm PKT")).toBeTruthy();
    expect(within(strip).getByText("PKR 9,000").tagName).toBe("S");
    const cal = within(strip).getByRole("group", { name: "Add to calendar" });
    expect(within(cal).getByRole("link", { name: /Phone or Outlook/ }).getAttribute("href")).toBe("/courses/fake-course/calendar.ics");
    expect(within(enrollBox()).getByText("PKR 9,000")).toBeTruthy();
  });
  it("an upcoming webinar with a date shows the date strip and the Date fact", async () => {
    h.course = base({ type: "webinar", pricePkr: 0, startsAt: "2099-11-10T14:00:00.000Z" }) as unknown as Record<string, unknown>;
    await renderPage();
    const strip = screen.getByRole("region", { name: "Webinar date" });
    expect(within(strip).getByText("Tue 10 November 2099, 7:00 pm PKT")).toBeTruthy();
    expect(within(strip).getByRole("group", { name: "Add to calendar" })).toBeTruthy();
    expect(within(hero()).getByText("Tue 10 November 2099, 7:00 pm PKT")).toBeTruthy();
  });
  it("a webinar long past shows no date strip", async () => {
    h.course = base({ type: "webinar", pricePkr: 0, startsAt: "2020-11-10T14:00:00.000Z" }) as unknown as Record<string, unknown>;
    await renderPage();
    expect(screen.queryByRole("region", { name: "Webinar date" })).toBeNull();
  });
});
