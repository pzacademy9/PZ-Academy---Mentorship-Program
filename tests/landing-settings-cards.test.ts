import { describe, it, expect } from "vitest";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import { settingsCardStatus, readyCount } from "@/lib/landing/settings-cards";

const A = "https://chat.whatsapp.com/AAAAAAAAAA";
const B = "https://chat.whatsapp.com/BBBBBBBBBB";

function page(over: { modes?: ("live" | "recorded")[]; fullWa?: string; m1Wa?: string; enabled?: boolean } = {}): LandingContent {
  const c = emptyContent("course");
  c.settings.registerLabel = "Register now";
  c.registration = {
    ...c.registration,
    enabled: over.enabled ?? true,
    modes: over.modes ?? ["live"],
    regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] }],
    defaultRegionKey: "PK",
    options: [
      { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: over.fullWa ?? A, moduleIds: [] },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: over.m1Wa ?? B, moduleIds: [] },
    ],
    prices: { full: { PK: { amount: 1000 } }, m1: { PK: { amount: 500 } } },
  };
  return c;
}
const ctx = { hasCourse: true };

describe("settingsCardStatus", () => {
  it("empty modes needs attention", () => {
    expect(settingsCardStatus(page({ modes: [] }), ctx).who).toBe("attention");
    expect(settingsCardStatus(page(), ctx).who).toBe("ready");
  });
  it("a blank button label needs attention", () => {
    const c = page();
    c.settings.registerLabel = "  ";
    expect(settingsCardStatus(c, ctx).button).toBe("attention");
  });
  it("registration off with no https link needs attention, on is ready", () => {
    const off = page({ enabled: false });
    expect(settingsCardStatus(off, ctx).button).toBe("attention");
    off.settings.registerUrl = "https://example.com/register";
    expect(settingsCardStatus(off, ctx).button).toBe("ready");
    expect(settingsCardStatus(page(), ctx).button).toBe("ready");
  });
  it("a missing group link on a live paid option makes links need attention", () => {
    expect(settingsCardStatus(page({ m1Wa: "" }), ctx).links).toBe("attention");
  });
  it("a shared group link makes links need attention", () => {
    expect(settingsCardStatus(page({ fullWa: A, m1Wa: A }), ctx).links).toBe("attention");
  });
  it("recorded with no course and no portal link makes links need attention", () => {
    const c = page({ modes: ["recorded"], fullWa: "", m1Wa: "" });
    expect(settingsCardStatus(c, { hasCourse: false }).links).toBe("attention");
    expect(settingsCardStatus(c, { hasCourse: true }).links).toBe("ready");
  });
  it("a fully set page is ready on all five and readyCount is 5", () => {
    const s = settingsCardStatus(page(), ctx);
    expect(s).toEqual({ who: "ready", button: "ready", after: "ready", links: "ready", dates: "ready" });
    expect(readyCount(s)).toBe(5);
    expect(readyCount({ ...s, who: "attention", links: "attention" })).toBe(3);
  });
});
