// tests/landing-dates.test.ts
import { describe, it, expect } from "vitest";
import { emptyContent } from "@/lib/landing/content";
import type { LandingContent } from "@/lib/landing/content";
import {
  isRealDate, formatDateRange, weekdayText, datesFor, applyAutoDates, unfilledDateMarkers,
} from "@/lib/landing/dates";

const RANGES: [string, string][] = [
  ["2026-11-27", "2026-11-29"], ["2026-12-04", "2026-12-06"], ["2026-12-11", "2026-12-13"],
  ["2026-12-18", "2026-12-20"], ["2026-12-25", "2026-12-27"],
];

function build(opts: { modules?: boolean; heroText?: string } = {}): LandingContent {
  const c = emptyContent("course");
  const withModules = opts.modules !== false;
  c.modules = withModules
    ? RANGES.map(([s, e], i) => ({
        key: `module-${i + 1}`, title: `Module ${i + 1}`, format: "3-Day Workshop", days: 3, optionKey: "", startsOn: s, endsOn: e,
      }))
    : [];
  c.sections = c.sections.map((s) => (s.type === "hero" ? { ...s, enabled: true, data: { ...s.data, dateLine: opts.heroText ?? "{dates} ({weekdays})" } } : s));
  return c;
}
const hero = (c: LandingContent) => c.sections.find((s) => s.type === "hero")!;

describe("isRealDate", () => {
  it("accepts real dates only", () => {
    expect(isRealDate("2026-11-27")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("")).toBe(false);
    expect(isRealDate("27/11/2026")).toBe(false);
  });
});

describe("formatDateRange", () => {
  it("formats same month, cross month, cross year and single day", () => {
    expect(formatDateRange("2026-11-27", "2026-11-29")).toBe("27 – 29 Nov 2026");
    expect(formatDateRange("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Dec 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatDateRange("2026-11-27", "2026-11-27")).toBe("27 Nov 2026");
  });
});

describe("weekdayText", () => {
  it("lists weekdays of short ranges and nothing for long ones", () => {
    expect(weekdayText([{ start: "2026-11-27", end: "2026-11-29" }])).toBe("Fri, Sat & Sun");
    expect(weekdayText([{ start: "2026-11-27", end: "2026-11-28" }])).toBe("Fri & Sat");
    expect(weekdayText([{ start: "2026-11-27", end: "2026-11-27" }])).toBe("Fri");
    expect(weekdayText([{ start: "2026-12-01", end: "2026-12-10" }])).toBe("");
  });
});

describe("datesFor", () => {
  it("covers the whole course across five modules", () => {
    const c = build();
    expect(datesFor(c, null)).toEqual({ start: "2026-11-27", end: "2026-12-27" });
    expect(weekdayText(RANGES.map(([start, end]) => ({ start, end })))).toBe("Fri, Sat & Sun");
  });
  it("returns one module's range, or null when it has no dates or does not exist", () => {
    const c = build();
    expect(datesFor(c, "module-2")).toEqual({ start: "2026-12-04", end: "2026-12-06" });
    expect(datesFor(c, "nope")).toBeNull();
  });
  it("falls back to the event dates when no module has a range", () => {
    const c = build({ modules: false });
    expect(datesFor(c, null)).toBeNull();
    c.settings.eventStartsOn = "2026-12-01";
    c.settings.eventEndsOn = "2026-12-03";
    expect(datesFor(c, null)).toEqual({ start: "2026-12-01", end: "2026-12-03" });
  });
});

describe("applyAutoDates", () => {
  it("fills dates and weekdays for the main ref and a module ref", () => {
    const c = build();
    expect(applyAutoDates(c, { moduleKey: null }).sections.find((s) => s.type === "hero")!.data.dateLine).toBe("27 Nov – 27 Dec 2026 (Fri, Sat & Sun)");
    expect(hero(applyAutoDates(c, { moduleKey: "module-3" })).data.dateLine).toBe("11 – 13 Dec 2026 (Fri, Sat & Sun)");
  });
  it("drops the empty weekday brackets for a 10-day module", () => {
    const c = build();
    c.modules[0] = { ...c.modules[0], startsOn: "2026-12-01", endsOn: "2026-12-10" };
    expect(hero(applyAutoDates(c, { moduleKey: "module-1" })).data.dateLine).toBe("1 – 10 Dec 2026");
  });
  it("resolves keyed markers and blanks unknown keys", () => {
    const c = build();
    c.sections = c.sections.map((s) => (s.type === "curriculum" ? { ...s, data: { items: [{ title: "A {dates:module-2}" }, { title: "B {dates:ghost}" }] } } : s));
    const out = applyAutoDates(c, { moduleKey: null });
    const items = out.sections.find((s) => s.type === "curriculum")!.data.items as { title: string }[];
    expect(items[0].title).toBe("A 4 – 6 Dec 2026");
    expect(items[1].title).toBe("B ");
  });
  it("fills an empty schedule when from its module and leaves typed text", () => {
    const c = build();
    c.sections = c.sections.map((s) => (s.type === "schedule" ? { ...s, data: { items: [{ when: "", module: "module-2" }, { when: "Typed", module: "module-2" }] } } : s));
    const out = applyAutoDates(c, { moduleKey: null });
    const items = out.sections.find((s) => s.type === "schedule")!.data.items as { when: string }[];
    expect(items[0].when).toBe("4 – 6 Dec 2026");
    expect(items[1].when).toBe("Typed");
  });
  it("returns typed text without markers unchanged", () => {
    const c = build({ heroText: "Join us in December" });
    const out = applyAutoDates(c, { moduleKey: null });
    expect(out.sections.map((s) => s.data)).toEqual(c.sections.map((s) => s.data));
  });
  it("makes the countdown follow Early Bird only when switched on", () => {
    const c = build();
    c.registration = { ...c.registration, earlyBirdEndsAt: "2026-11-20T23:59" };
    c.settings.countdownTo = "keep";
    c.settings.countdownFollowsEarlyBird = true;
    expect(applyAutoDates(c, { moduleKey: null }).settings.countdownTo).toBe("2026-11-20T23:59");
    c.settings.countdownFollowsEarlyBird = false;
    expect(applyAutoDates(c, { moduleKey: null }).settings.countdownTo).toBe("keep");
    delete c.settings.countdownFollowsEarlyBird;
    expect(applyAutoDates(c, { moduleKey: null }).settings.countdownTo).toBe("keep");
    c.settings.countdownFollowsEarlyBird = true;
    c.registration = { ...c.registration, earlyBirdEndsAt: "" };
    expect(applyAutoDates(c, { moduleKey: null }).settings.countdownTo).toBe("");
  });
  it("does not mutate its input", () => {
    const c = build();
    c.settings.countdownFollowsEarlyBird = true;
    const before = JSON.stringify(c);
    applyAutoDates(c, { moduleKey: null });
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe("unfilledDateMarkers", () => {
  it("lists the hero while no dates exist and nothing once they do", () => {
    const c = build({ modules: false });
    const listed = unfilledDateMarkers(c, null);
    expect(listed.map((l) => l.sectionId)).toContain(hero(c).id);
    expect(listed.find((l) => l.sectionId === hero(c).id)!.sectionLabel).toBeTruthy();
    c.settings.eventStartsOn = "2026-12-01";
    c.settings.eventEndsOn = "2026-12-03";
    expect(unfilledDateMarkers(c, null)).toEqual([]);
  });
  it("lists a schedule row with a module and no dates", () => {
    const c = build({ modules: false, heroText: "plain" });
    c.sections = c.sections.map((s) => (s.type === "schedule" ? { ...s, enabled: true, data: { items: [{ when: "", module: "module-9" }] } } : s));
    expect(unfilledDateMarkers(c, null).map((l) => l.sectionId)).toContain(c.sections.find((s) => s.type === "schedule")!.id);
  });
});
