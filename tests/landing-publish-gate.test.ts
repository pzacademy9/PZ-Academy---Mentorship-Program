import { describe, it, expect } from "vitest";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import { publishCheck } from "@/lib/landing/publish-gate";

const A = "https://chat.whatsapp.com/AAAAAAAAAA";
const B = "https://chat.whatsapp.com/BBBBBBBBBB";
const page = { title: "Demo Page", slug: "demo-page", hasCourse: true };

function ready(): LandingContent {
  const c = emptyContent("course");
  c.seo.description = "A short description.";
  c.settings.countdownFollowsEarlyBird = false;
  c.settings.registerUrl = "https://example.com/register";
  c.sections = [{ id: "s1", type: "rich_text", enabled: true, data: { heading: "About", body: "Some text." } }];
  return c;
}
function withReg(c: LandingContent, a: string, b: string): LandingContent {
  c.registration = {
    ...c.registration,
    enabled: true,
    modes: ["live"],
    regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] }],
    defaultRegionKey: "PK",
    refPrefix: "TST",
    eventLabel: "Test Batch",
    whatsappVerifyNumber: "923001234567",
    options: [
      { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: a, moduleIds: [] },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: b, moduleIds: [] },
    ],
    prices: { full: { PK: { amount: 1000 } }, m1: { PK: { amount: 500 } } },
  };
  return c;
}

describe("publishCheck", () => {
  it("ready page returns ready true with checks", () => {
    const r = publishCheck(withReg(ready(), A, B), page);
    expect(r.problems).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.checks.length).toBeGreaterThan(0);
  });
  it("a failure becomes a problem with a plain message", () => {
    const r = publishCheck(withReg(ready(), A, ""), page);
    expect(r.ready).toBe(false);
    const p = r.problems.find((x) => x.message.includes("Module 1"));
    expect(p).toBeDefined();
    expect(p!.sectionId).toBe("registration:whatsapp");
  });
  it("a shared-link warning leaves ready true and appears in warnings", () => {
    const r = publishCheck(withReg(ready(), A, A), page);
    expect(r.ready).toBe(true);
    expect(r.warnings.map((w) => w.id)).toEqual(["shared-groups"]);
  });
  it("a page with computeReadiness problems keeps them", () => {
    const r = publishCheck(ready(), { ...page, title: "" });
    expect(r.ready).toBe(false);
    expect(r.problems[0].message).toBe("Give the page a name.");
  });
  it("a recorded page with no portal points at page settings", () => {
    const c = withReg(ready(), "", "");
    c.registration.modes = ["recorded"];
    const r = publishCheck(c, { ...page, hasCourse: false });
    expect(r.ready).toBe(false);
    expect(r.problems.find((x) => x.message.includes("no portal"))?.sectionId).toBe("__settings__");
  });
});

describe("date publish checks", () => {
  const mod = (over: Record<string, unknown> = {}) => ({ key: "m1", title: "Module One", format: "3-Day Workshop", days: 3, optionKey: "", startsOn: "", endsOn: "", ...over });
  const heroPage = (text: string) => {
    const c = ready();
    c.sections = [{ id: "h1", type: "hero", enabled: true, data: { headline: "Hi", dateLine: text } }];
    return c;
  };
  it("a hero with {dates} and no dates blocks, naming the section", () => {
    const r = publishCheck(heroPage("{dates}"), page);
    const p = r.problems.find((x) => x.sectionId === "h1");
    expect(r.ready).toBe(false);
    expect(p!.message).toContain("Hero");
    expect(p!.message).toContain("Dates box in Page settings");
  });
  it("the same page with dates has no date problem", () => {
    const c = heroPage("{dates}");
    c.settings.eventStartsOn = "2026-11-27";
    c.settings.eventEndsOn = "2026-11-29";
    const r = publishCheck(c, page);
    expect(r.problems.find((x) => x.sectionId === "h1")).toBeUndefined();
  });
  it("a schedule row with no date and no module blocks", () => {
    const c = ready();
    c.sections = [{ id: "sc", type: "schedule", enabled: true, data: { heading: "S", items: [{ when: "", title: "Intro" }] } }];
    const r = publishCheck(c, page);
    expect(r.problems.map((x) => x.message)).toContain("A schedule row has no date. Type one, or link the row to a module that has dates.");
  });
  it("a schedule row linked to a module with dates is fine", () => {
    const c = ready();
    c.modules = [mod({ startsOn: "2026-11-27", endsOn: "2026-11-29" })];
    c.sections = [{ id: "sc", type: "schedule", enabled: true, data: { heading: "S", items: [{ when: "", title: "Intro", module: "m1" }] } }];
    const r = publishCheck(c, page);
    expect(r.problems).toEqual([]);
  });
  it("a module with only a start date blocks", () => {
    const c = ready();
    c.modules = [mod({ startsOn: "2026-11-27" })];
    const r = publishCheck(c, page);
    expect(r.problems.map((x) => x.message)).toContain("Module One: the end date is before the start date, or one date is missing.");
  });
  it("a module ending before it starts blocks; a module with neither date is fine", () => {
    const c = ready();
    c.modules = [mod({ startsOn: "2026-11-29", endsOn: "2026-11-27" })];
    expect(publishCheck(c, page).problems.map((x) => x.message)).toContain("Module One: the end date is before the start date, or one date is missing.");
    c.modules = [mod()];
    expect(publishCheck(c, page).problems).toEqual([]);
  });
});
