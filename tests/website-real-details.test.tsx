import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";
import { SEATS_SHOWN_AT, batchEarlyBird, seatsLeft, seatsLeftText, startsAtLabel } from "@/lib/marketing/batch-facts";
import { courseCalendarEvent, googleCalendarUrl, icsFile, type CalendarEvent } from "@/lib/marketing/calendar";
import { RECORDED_AFTER_HOURS, isUpcomingWebinar } from "@/lib/marketing/webinar-time";
import { cleanTopic, hasTopic, topicsOf } from "@/lib/marketing/topics";
import { changedPageFields, normalizeSections, pageFieldsPatch, type PublicPageFields } from "@/lib/marketing/course-sections";
import { courseConfigSchema } from "@/lib/validations/admin-lms";
import { LiveBatchBanner } from "@/components/marketing/LiveBatchBanner";
import { WebinarDateBanner } from "@/components/marketing/WebinarDateBanner";
import { CourseCard } from "@/components/marketing/CourseCard";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { WebinarGrid } from "@/components/marketing/WebinarGrid";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

afterEach(cleanup);

const HOUR = 3_600_000;

describe("seatsLeft", () => {
  it("is null without a limit", () => expect(seatsLeft(0, 5)).toBeNull());
  it("is null while plenty of seats remain", () => expect(seatsLeft(100, 10)).toBeNull());
  it(`shows at ${SEATS_SHOWN_AT} or fewer`, () => {
    expect(seatsLeft(30, 10)).toBe(20);
    expect(seatsLeft(30, 29)).toBe(1);
  });
  it("is null for an unknown count and never negative", () => {
    expect(seatsLeft(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(seatsLeft(10, 12)).toBe(0);
  });
  it("words one and many", () => {
    expect(seatsLeftText(1)).toBe("1 seat left");
    expect(seatsLeftText(4)).toBe("4 seats left");
  });
});

function cfg(over: Partial<RegistrationConfig> = {}): RegistrationConfig {
  return {
    ...DEFAULT_REGISTRATION,
    enabled: true,
    modes: ["live", "recorded"],
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
      { key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "", moduleIds: [] },
      { key: "full", label: "Complete course", kind: "bundle", free: false, waGroupUrl: "", moduleIds: [] },
    ],
    moduleMix: { enabled: true, bundleOptionKey: "full" },
    tiers: [],
    prices: {
      m1: { PK: { amount: 1200, earlyAmount: 1000 } },
      full: { PK: { amount: 4000, earlyAmount: 3200 }, UAE: { amount: 180, earlyAmount: 150 } },
    },
    earlyBirdEndsAt: "2026-09-24T23:59:00+05:00",
    ...over,
  };
}
const before = new Date("2026-09-20T10:00:00+05:00");
const after = new Date("2026-09-25T10:00:00+05:00");

describe("batchEarlyBird", () => {
  it("uses the whole-course price in the main country", () => {
    const e = batchEarlyBird(cfg(), before);
    expect(e).not.toBeNull();
    expect(e!.price).toContain("3,200");
    expect(e!.was).toContain("4,000");
    expect(e!.until).toBe("24 September 2026");
  });
  it("is null once Early Bird has ended", () => expect(batchEarlyBird(cfg(), after)).toBeNull());
  it("is null with no Early Bird date", () => expect(batchEarlyBird(cfg({ earlyBirdEndsAt: "" }), before)).toBeNull());
  it("falls back to the first paid bundle without module mixing", () => {
    const e = batchEarlyBird(cfg({ moduleMix: { enabled: false, bundleOptionKey: "" } }), before);
    expect(e!.price).toContain("3,200");
  });
  it("is null when no early price differs", () => {
    const c = cfg({ prices: { m1: { PK: { amount: 1200 } }, full: { PK: { amount: 4000 } } } });
    expect(batchEarlyBird(c, before)).toBeNull();
  });
});

describe("startsAtLabel", () => {
  it("shows date and Pakistan time", () => expect(startsAtLabel("2026-12-12T14:00:00Z")).toBe("Sat 12 December 2026, 7:00 pm PKT"));
  it("shows the date only at midnight Pakistan time", () => expect(startsAtLabel("2026-12-11T19:00:00Z")).toBe("Sat 12 December 2026"));
  it("is empty when invalid", () => {
    expect(startsAtLabel("")).toBe("");
    expect(startsAtLabel("soon")).toBe("");
  });
});

const ev: CalendarEvent = { title: "Fake Course, Batch 1; live", startIso: "2026-12-12T14:00:00Z", minutes: 120, details: "PZ Academy live batch starts.", url: "https://fake.example/courses/fake" };

describe("calendar", () => {
  it("builds a Google Calendar link with start and end", () => {
    const u = new URL(googleCalendarUrl(ev)!);
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("dates")).toBe("20261212T140000Z/20261212T160000Z");
    expect(u.searchParams.get("text")).toBe(ev.title);
    expect(u.searchParams.get("details")).toContain(ev.url);
  });
  it("writes a valid .ics with escaped text and CRLF lines", () => {
    const t = icsFile(ev, "fake-uid", Date.parse("2026-11-04T00:00:00Z"))!;
    expect(t.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(t).toContain("DTSTART:20261212T140000Z");
    expect(t).toContain("DTEND:20261212T160000Z");
    expect(t).toContain("SUMMARY:Fake Course\\, Batch 1\; live");
    expect(t.split("\r\n").every((l) => Array.from(l).length <= 75)).toBe(true);
    expect(t.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("gives nothing for a bad date", () => {
    expect(googleCalendarUrl({ ...ev, startIso: "x" })).toBeNull();
    expect(icsFile({ ...ev, startIso: "x" }, "u", 0)).toBeNull();
  });
  const now = Date.parse("2026-11-04T00:00:00Z");
  const course = { title: "Fake Webinar", slug: "fake-w", type: "webinar", status: "open", startsAt: "2026-11-10T14:00:00Z" };
  it("prefers a batch with a future start", () => {
    const e = courseCalendarEvent({ course, batch: { title: "Fake Batch", startsAt: "2026-12-01T14:00:00Z" }, origin: "https://fake.example/", nowMs: now, webinarUpcoming: true });
    expect(e).toMatchObject({ title: "Fake Batch", startIso: "2026-12-01T14:00:00Z", url: "https://fake.example/courses/fake-w" });
  });
  it("uses an upcoming webinar's own date when there is no batch date", () => {
    const e = courseCalendarEvent({ course, batch: { title: "B", startsAt: "" }, origin: "https://fake.example", nowMs: now, webinarUpcoming: true });
    expect(e?.title).toBe("Fake Webinar");
  });
  it("offers nothing for a past or not-upcoming webinar or a course without dates", () => {
    expect(courseCalendarEvent({ course, batch: null, origin: "o", nowMs: now, webinarUpcoming: false })).toBeNull();
    expect(courseCalendarEvent({ course: { ...course, startsAt: "2026-01-01T00:00:00Z" }, batch: null, origin: "o", nowMs: now, webinarUpcoming: true })).toBeNull();
    expect(courseCalendarEvent({ course: { ...course, type: "course" }, batch: null, origin: "o", nowMs: now, webinarUpcoming: true })).toBeNull();
  });
});

describe("isUpcomingWebinar", () => {
  const start = Date.parse("2026-11-10T14:00:00Z");
  it("an open webinar without a date stays upcoming", () => expect(isUpcomingWebinar({ status: "open" }, start)).toBe(true));
  it("a closed one is never upcoming", () => expect(isUpcomingWebinar({ status: "closed", startsAt: "2099-01-01T00:00:00Z" }, start)).toBe(false));
  it(`moves to recorded ${RECORDED_AFTER_HOURS} hours after it starts`, () => {
    const w = { status: "open", startsAt: "2026-11-10T14:00:00Z" };
    expect(isUpcomingWebinar(w, start + RECORDED_AFTER_HOURS * HOUR - 1)).toBe(true);
    expect(isUpcomingWebinar(w, start + RECORDED_AFTER_HOURS * HOUR)).toBe(false);
  });
});

describe("topics", () => {
  it("cleans spaces and lists each topic once, A to Z", () => {
    expect(cleanTopic("  Clinical   Pharmacy ")).toBe("Clinical Pharmacy");
    expect(topicsOf([{ topic: "pharmacology" }, { topic: "Clinical" }, { topic: "Pharmacology" }, { topic: null }, { topic: " " }])).toEqual(["Clinical", "pharmacology"]);
    expect(hasTopic({ topic: "Clinical " }, "clinical")).toBe(true);
  });
});

describe("course editor: topic and webinar date", () => {
  const v: PublicPageFields = { publicVideoUrl: "", certificateImageUrl: "", outcomes: [], features: [], faqs: [], pageSections: normalizeSections(null), topic: "Clinical", startsAt: "2026-11-10T14:00:00.000Z" };
  it("sends nothing when unchanged (works before the database step)", () => {
    expect(changedPageFields(v, { ...v, topic: " Clinical ", startsAt: "2026-11-10T14:00:00Z" })).toEqual({});
  });
  it("sends a changed topic and date, and empty to clear", () => {
    expect(changedPageFields(v, { ...v, topic: "Pharmacology", startsAt: "" })).toEqual({ topic: "Pharmacology", startsAt: "" });
  });
  it("maps to database columns, empty = null, left out = untouched", () => {
    expect(pageFieldsPatch({ topic: "", startsAt: "" })).toEqual({ topic: null, starts_at: null });
    expect(pageFieldsPatch({ topic: " A  B ", startsAt: "2026-11-10T19:00:00+05:00" })).toEqual({ topic: "A B", starts_at: "2026-11-10T14:00:00.000Z" });
    expect(pageFieldsPatch({})).toEqual({});
  });
  const base = { title: "Fake", type: "webinar", status: "open", pricePkr: 0 };
  it("the checker takes a full time with zone, or empty", () => {
    expect(courseConfigSchema.safeParse({ ...base, startsAt: "2026-11-10T14:00:00.000Z" }).success).toBe(true);
    expect(courseConfigSchema.safeParse({ ...base, startsAt: "" }).success).toBe(true);
    expect(courseConfigSchema.safeParse({ ...base, startsAt: "2026-11-10T14:00" }).success).toBe(false);
    expect(courseConfigSchema.safeParse({ ...base, startsAt: "tomorrow" }).success).toBe(false);
    expect(courseConfigSchema.safeParse({ ...base, topic: "x".repeat(41) }).success).toBe(false);
  });
});

const card = (over: Partial<CourseCardData> = {}): CourseCardData => ({
  id: "c1", slug: "fake", title: "Fake Course", type: "course", status: "open", tagline: null, thumbnailUrl: null,
  level: null, durationLabel: null, pricePkr: 1000, mentorName: null, mentorTitle: null, mentorAvatarUrl: null,
  publicVideoUrl: null, ...over,
});

describe("LiveBatchBanner extras", () => {
  it("shows time, seats, Early Bird with the old price crossed out, and calendar links", () => {
    render(
      <LiveBatchBanner
        title="Fake Batch"
        startsOn="12 December 2026"
        startsAtLabel="Sat 12 December 2026, 7:00 pm PKT"
        href="/e/fake?src=website"
        seatsLeft={4}
        earlyBird={{ price: "PKR 3,200", was: "PKR 4,000", until: "24 September 2026" }}
        calendar={{ google: "https://calendar.google.com/calendar/render?x=1", ics: "/courses/fake/calendar.ics" }}
      />,
    );
    expect(screen.getByText("Starts Sat 12 December 2026, 7:00 pm PKT")).toBeTruthy();
    expect(screen.getByText("4 seats left")).toBeTruthy();
    expect(screen.getByText("PKR 4,000").tagName).toBe("S");
    expect(screen.getByText("until 24 September 2026")).toBeTruthy();
    const cal = screen.getByRole("group", { name: "Add to calendar" });
    expect(within(cal).getByRole("link", { name: /Google Calendar/ }).getAttribute("href")).toContain("calendar.google.com");
    expect(within(cal).getByRole("link", { name: /Phone or Outlook/ }).getAttribute("href")).toBe("/courses/fake/calendar.ics");
  });
  it("shows none of the extras when not given", () => {
    render(<LiveBatchBanner title="Fake" startsOn="" href="/e/x" />);
    expect(screen.queryByText(/seat/)).toBeNull();
    expect(screen.queryByText(/Early Bird/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Add to calendar" })).toBeNull();
  });
  it("webinar strip shows the date and calendar", () => {
    render(<WebinarDateBanner when="Tue 10 November 2026, 7:00 pm PKT" calendar={{ google: "https://calendar.google.com/x", ics: "/courses/w/calendar.ics" }} />);
    expect(screen.getByText("Tue 10 November 2026, 7:00 pm PKT")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Add to calendar" })).toBeTruthy();
  });
});

describe("list card chips", () => {
  it("shows Early Bird and seats left only when the batch has them", () => {
    const { rerender } = render(<CourseCard layout="list" course={card({ liveBatch: { startsOn: "", href: "/e/x" } })} />);
    expect(screen.queryByText("Early Bird")).toBeNull();
    expect(screen.queryByText(/seats? left/)).toBeNull();
    rerender(<CourseCard layout="list" course={card({ liveBatch: { startsOn: "", href: "/e/x", seatsLeft: 3, earlyBird: true } })} />);
    expect(screen.getByText("Early Bird")).toBeTruthy();
    expect(screen.getByText("3 seats left")).toBeTruthy();
  });
  it("attachLiveBatches carries seats and Early Bird", () => {
    const out = attachLiveBatches([card()], new Map([["c1", { startsOn: "", href: "/e/x", seatsLeft: 2, earlyBird: { price: "a", was: "b", until: null } }]]));
    expect(out[0].liveBatch).toEqual({ startsOn: "", href: "/e/x", seatsLeft: 2, earlyBird: true });
  });
});

describe("topic buttons", () => {
  const courses = [
    card({ id: "a", title: "Fake A", topic: "Clinical" }),
    card({ id: "b", title: "Fake B", topic: "Pharmacology" }),
    card({ id: "c", title: "Fake C", topic: null }),
  ];
  it("lists only topics that have a course and filters the grid", () => {
    render(<CourseCatalogGrid courses={courses} />);
    const group = screen.getByRole("group", { name: "Topics" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "Clinical", "Pharmacology"]);
    fireEvent.click(within(group).getByRole("button", { name: "Clinical" }));
    expect(screen.getByText("Fake A")).toBeTruthy();
    expect(screen.queryByText("Fake B")).toBeNull();
    expect(screen.queryByText("Fake C")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "All" }));
    expect(screen.getByText("Fake C")).toBeTruthy();
  });
  it("hides the buttons when no course has a topic", () => {
    render(<CourseCatalogGrid courses={[card({ topic: null })]} />);
    expect(screen.queryByRole("group", { name: "Topics" })).toBeNull();
  });
});

describe("webinar list with dates", () => {
  const now = Date.parse("2026-11-10T18:00:00Z");
  it("a dated webinar more than 3 hours past moves to recorded; a future one shows its date", () => {
    render(
      <WebinarGrid
        nowMs={now}
        webinars={[
          card({ id: "w1", type: "webinar", title: "Fake Past", status: "open", startsAt: "2026-11-10T14:00:00Z" }),
          card({ id: "w2", type: "webinar", title: "Fake Next", status: "open", startsAt: "2026-11-20T14:00:00Z", timings: "old text" }),
        ]}
      />,
    );
    const up = screen.getByRole("region", { name: "Upcoming live webinars" });
    const rec = screen.getByRole("region", { name: "Recorded sessions" });
    expect(within(up).getByText("Fake Next")).toBeTruthy();
    expect(within(up).getByText("Fri 20 November 2026, 7:00 pm PKT")).toBeTruthy();
    expect(within(up).queryByText("old text")).toBeNull();
    expect(within(rec).getByText("Fake Past")).toBeTruthy();
  });
});
