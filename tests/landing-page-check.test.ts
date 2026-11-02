import { describe, it, expect } from "vitest";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import { runPageChecks, failures, warnings, countryProblem } from "@/lib/landing/page-check";

const WA1 = "https://chat.whatsapp.com/AAA1111111";
const WA2 = "https://chat.whatsapp.com/BBB2222222";

function page(over: {
  modes?: ("live" | "recorded")[]; fullWa?: string; m1Wa?: string; portalLink?: string;
  defaultRegionKey?: string; enabled?: boolean;
} = {}): LandingContent {
  const c = emptyContent("course");
  c.settings.portalLink = over.portalLink ?? "";
  c.modules = [{ key: "m1", title: "Module One", format: "3-Day Workshop", days: 3, optionKey: "m1" } as never];
  c.registration = {
    ...c.registration,
    enabled: over.enabled ?? true,
    modes: over.modes ?? ["live"],
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
      { key: "AE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
    ],
    defaultRegionKey: over.defaultRegionKey ?? "PK",
    options: [
      { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: over.fullWa ?? "", moduleIds: [] },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: over.m1Wa ?? "", moduleIds: [] },
    ],
    prices: {
      full: { PK: { amount: 1000 }, AE: { amount: 100 } },
      m1: { PK: { amount: 500 }, AE: { amount: 50 } },
    },
  };
  return c;
}
const ctx = { hasCourse: true };
const byId = (c: LandingContent, id: string, x = ctx) => runPageChecks(c, x).find((k) => k.id === id);

describe("runPageChecks", () => {
  it("live groups fail names the option without a link", () => {
    const k = byId(page({ fullWa: WA1 }), "live-groups")!;
    expect(k.status).toBe("fail");
    expect(k.detail).toContain("Module 1");
    expect(k.step).toBe("whatsapp");
  });
  it("a page with no group links at all passes live-groups", () => {
    const k = byId(page(), "live-groups")!;
    expect(k.status).toBe("pass");
    expect(k.title).toBe("This page has no WhatsApp groups");
  });
  it("shared link is a warning that names both options", () => {
    const c = page({ fullWa: WA1, m1Wa: WA1 });
    const w = warnings(runPageChecks(c, ctx));
    expect(w).toHaveLength(1);
    expect(w[0].id).toBe("shared-groups");
    expect(w[0].detail).toContain("Full Course and Module 1");
    expect(byId(page({ fullWa: WA1, m1Wa: WA2 }), "shared-groups")?.status).not.toBe("warn");
  });
  it("recorded buyer of every option gets no group link", () => {
    const k = byId(page({ modes: ["live", "recorded"], fullWa: WA1, m1Wa: WA2 }), "recorded-no-group")!;
    expect(k.status).toBe("pass");
  });
  it("recorded offered with no course and no pasted link fails recorded-portal", () => {
    const k = byId(page({ modes: ["recorded"] }), "recorded-portal", { hasCourse: false })!;
    expect(k.status).toBe("fail");
    expect(k.detail ?? k.title).toContain("Recorded students have no portal");
    expect(k.sectionId).toBe("__settings__");
  });
  it("recorded with a course passes", () => {
    expect(byId(page({ modes: ["recorded"] }), "recorded-portal")!.status).toBe("pass");
  });
  it("recorded with a pasted https link passes", () => {
    const c = page({ modes: ["recorded"], portalLink: "https://portal.example.com/x" });
    expect(byId(c, "recorded-portal", { hasCourse: false })!.status).toBe("pass");
  });
  it("recorded with a pasted http or relative link still fails recorded-portal", () => {
    for (const bad of ["http://portal.example.com/x", "#x", "https://portal.example.com/a b"]) {
      const c = page({ modes: ["recorded"], portalLink: bad });
      expect(byId(c, "recorded-portal", { hasCourse: false })!.status).toBe("fail");
    }
  });
  it("live-only page has no recorded-portal item", () => {
    expect(byId(page(), "recorded-portal", { hasCourse: false })).toBeUndefined();
  });
  it("UAE link passes when AE has prices for every option", () => {
    expect(byId(page(), "country-AE")!.status).toBe("pass");
    expect(byId(page(), "country-PK")!.status).toBe("pass");
  });
  it("a fabricated resolved page whose default region mismatches fails the country check", () => {
    const original = page().registration;
    const resolved = page().registration;
    resolved.regions = [resolved.regions[1]];
    resolved.defaultRegionKey = "PK";
    expect(countryProblem(resolved, "AE", original)).not.toBeNull();
    const mixed = { ...resolved, defaultRegionKey: "AE", prices: { full: { AE: { amount: 1 }, PK: { amount: 2 } } } };
    expect(countryProblem(mixed, "AE", original)).not.toBeNull();
  });
  it("module link passes, fails when its option is gone, and is skipped when unlinked", () => {
    expect(byId(page(), "module-m1")!.status).toBe("pass");
    const c = page();
    c.modules[0].optionKey = "gone";
    expect(byId(c, "module-m1")!.status).toBe("fail");
    c.modules[0].optionKey = "";
    expect(byId(c, "module-m1")).toBeUndefined();
  });
  it("disabled registration returns []", () => {
    expect(runPageChecks(page({ enabled: false }), ctx)).toEqual([]);
  });
  it("failures and warnings filter by status", () => {
    const checks = runPageChecks(page({ fullWa: WA1 }), ctx);
    expect(failures(checks).every((k) => k.status === "fail")).toBe(true);
    expect(failures(checks).length).toBeGreaterThan(0);
  });
});
