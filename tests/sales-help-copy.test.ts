import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";
import { GOLDEN_RULES, HONEST_NOTE, TOUR_STEPS, helpFaq } from "@/lib/crm/sales-help-copy";

const all = (s = DEFAULT_SETTINGS) =>
  [HONEST_NOTE, ...GOLDEN_RULES.flatMap((r) => [r.title, r.body]), ...TOUR_STEPS.flatMap((t) => [t.title, t.body]),
    ...helpFaq(s).flatMap((f) => [f.question, ...f.answer])].join("\n");

describe("help copy", () => {
  it("states the real limits from settings", () => {
    const text = helpFaq({ ...DEFAULT_SETTINGS, daily_cap: 45, hourly_cap: 12, spacing_min_s: 100, spacing_max_s: 200 })
      .flatMap((f) => f.answer).join(" ");
    expect(text).toContain("45 new chats a day");
    expect(text).toContain("12 in any hour");
    expect(text).toContain("100 to 200 seconds");
  });
  it("covers the spec's FAQ topics and the personal-number warning", () => {
    const ids = helpFaq(DEFAULT_SETTINGS).map((f) => f.id);
    expect(ids).toEqual(["wait", "daily", "break", "quiet", "warns", "outside", "who"]);
    expect(all()).toMatch(/personal number/i);
    expect(all()).toMatch(/My WhatsApp warns or restricts me/);
    expect(all()).toMatch(/outside the app/i);
  });
  it("never promises safety", () => {
    expect(all()).not.toMatch(/\bsafe\b|\bsafely\b|guarantee|anti-ban/i);
  });
  it("has exactly four tour steps, the last about automatic follow-ups", () => {
    expect(TOUR_STEPS.map((t) => t.title)).toEqual([
      "Start with your Today list",
      "Send a message",
      "Tap what happened",
      "We bring them back",
    ]);
  });
  it("formats quiet hours as clock times", () => {
    expect(helpFaq(DEFAULT_SETTINGS).find((f) => f.id === "quiet")!.answer.join(" ")).toContain("between 21:00 and 09:00");
  });
});
