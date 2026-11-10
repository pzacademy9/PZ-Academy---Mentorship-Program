// tests/landing-date-fixes.test.ts
// Final-review fixes for "landing dates in one place".
import { describe, it, expect } from "vitest";
import { emptyContent, computeReadiness } from "@/lib/landing/content";
import type { LandingContent } from "@/lib/landing/content";
import { datesFor, unfilledDateMarkers } from "@/lib/landing/dates";
import { runPageChecks, warnings } from "@/lib/landing/page-check";
import { buildTemplate } from "@/lib/landing/templates";

const page = { title: "T", slug: "t-page" };

function build(heroText = "{dates} ({weekdays})", twoModules = true): LandingContent {
  const c = emptyContent("course");
  c.modules = twoModules
    ? [
        { key: "module-1", title: "Module 1", format: "3-Day Workshop", days: 3, optionKey: "", startsOn: "2026-11-27", endsOn: "2026-11-29" },
        { key: "module-2", title: "Module 2", format: "3-Day Workshop", days: 3, optionKey: "", startsOn: "", endsOn: "" },
      ]
    : [];
  c.sections = c.sections.map((s) => (s.type === "hero" ? { ...s, enabled: true, data: { ...s.data, dateLine: heroText } } : s));
  return c;
}
const hero = (c: LandingContent) => c.sections.find((s) => s.type === "hero")!;
const msgs = (c: LandingContent) => computeReadiness(c, page).problems.map((p) => p.message);

describe("partly dated modules", () => {
  it("blocks a {dates} hero when one module has no dates, though the range still shows the dated module", () => {
    const c = build();
    expect(datesFor(c, null)).toEqual({ start: "2026-11-27", end: "2026-11-29" });
    expect(unfilledDateMarkers(c, null).map((u) => u.sectionId)).toContain(hero(c).id);
    expect(computeReadiness(c, page).problems.some((p) => p.sectionId === hero(c).id && /Dates box/.test(p.message))).toBe(true);
  });
  it("reports module 2's own link when module 2 has no dates", () => {
    const c = build("{dates}");
    expect(unfilledDateMarkers(c, "module-2").map((u) => u.sectionId)).toContain(hero(c).id);
    expect(unfilledDateMarkers(c, "module-1")).toEqual([]);
  });
  it("is fine once every module has dates", () => {
    const c = build();
    c.modules[1] = { ...c.modules[1], startsOn: "2026-12-04", endsOn: "2026-12-06" };
    expect(computeReadiness(c, page).problems.some((p) => /Dates box/.test(p.message))).toBe(false);
  });
  it("ignores old event dates once the page has modules", () => {
    const c = build("{dates}", false);
    c.settings.eventStartsOn = "2026-12-01";
    c.settings.eventEndsOn = "2026-12-03";
    expect(datesFor(c, null)).toEqual({ start: "2026-12-01", end: "2026-12-03" });
    expect(unfilledDateMarkers(c, null)).toEqual([]);
    c.modules = [{ key: "module-1", title: "Module 1", format: "3-Day Workshop", days: 3, optionKey: "", startsOn: "", endsOn: "" }];
    expect(datesFor(c, null)).toBeNull();
    expect(unfilledDateMarkers(c, null).map((u) => u.sectionId)).toContain(hero(c).id);
  });
  it("the half-filled module problem points at Page settings", () => {
    const c = build();
    c.modules[1] = { ...c.modules[1], startsOn: "2026-12-04", endsOn: "" };
    const p = computeReadiness(c, page).problems.find((x) => /end date is before/.test(x.message));
    expect(p?.sectionId).toBe("__settings__");
  });
});

describe("markers in SEO text", () => {
  it("blocks a marker in the SEO description, title or image, and not otherwise", () => {
    const c = build("plain");
    c.seo.description = "Join us {dates}";
    const text = "Date markers work only inside page sections, not in the page title or description. Type the text without the marker.";
    expect(msgs(c)).toContain(text);
    c.seo.description = "Join us";
    expect(msgs(c)).not.toContain(text);
    c.seo.title = "Course {weekdays}";
    expect(msgs(c)).toContain(text);
  });
});

describe("misspelt and unknown markers", () => {
  it("blocks a misspelt marker and names the fragment", () => {
    const c = build("Starts {Dates}");
    expect(msgs(c).some((m) => m.startsWith("A box has a date marker that is not spelled right: ") && m.includes("{Dates}"))).toBe(true);
    const d = build("Starts {dates:Module 1}");
    expect(msgs(d).some((m) => m.startsWith("A box has a date marker that is not spelled right: "))).toBe(true);
  });
  it("names a code that no module has", () => {
    const c = build("Starts {dates:nope}");
    c.modules[1] = { ...c.modules[1], startsOn: "2026-12-04", endsOn: "2026-12-06" };
    const m = msgs(c);
    expect(m).toContain("A box uses {dates:nope} but no module has the code nope.");
    expect(m.some((x) => /Dates box/.test(x))).toBe(false);
  });
});

describe("day-count warning", () => {
  it("is skipped when the module day count is unknown (0)", () => {
    const c = emptyContent("course");
    c.modules = [{ key: "m1", title: "M1", format: "3-Day Workshop", days: 0, optionKey: "", startsOn: "2026-11-27", endsOn: "2026-11-29" }];
    expect(warnings(runPageChecks(c, { hasCourse: false })).some((k) => k.id === "module-days-m1")).toBe(false);
    c.modules[0] = { ...c.modules[0], days: 2 };
    expect(warnings(runPageChecks(c, { hasCourse: false })).some((k) => k.id === "module-days-m1")).toBe(true);
  });
});

describe("templates", () => {
  it("start with the countdown following Early Bird", () => {
    for (const [id, kind] of [["ppc-batch-3", "course"], ["mdc-batch-3", "workshop"], ["w20-diabetes", "webinar"]] as const) {
      expect(buildTemplate(id, kind)!.settings.countdownFollowsEarlyBird, id).toBe(true);
    }
  });
});
