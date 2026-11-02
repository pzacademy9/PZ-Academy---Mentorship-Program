import { describe, it, expect } from "vitest";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import { publishCheck } from "@/lib/landing/publish-gate";

const A = "https://chat.whatsapp.com/AAAAAAAAAA";
const B = "https://chat.whatsapp.com/BBBBBBBBBB";
const page = { title: "Demo Page", slug: "demo-page", hasCourse: true };

function ready(): LandingContent {
  const c = emptyContent("course");
  c.seo.description = "A short description.";
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
