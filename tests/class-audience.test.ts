import { describe, it, expect } from "vitest";
import {
  parseOption,
  matchAudience,
  audienceFromJson,
  presetLiveWithModule,
  optionPatterns,
  AUDIENCE_PRESETS,
} from "@/lib/classes/audience";

function ilikeToRegex(p: string): RegExp {
  const esc = p
    .replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "i");
}
const matchesAny = (patterns: string[], label: string) =>
  patterns.some((p) => ilikeToRegex(p).test(label));

describe("parseOption", () => {
  it("reads full course in any dash style", () => {
    const want = { mode: "live", full: true, modules: [] };
    expect(parseOption("Live — Full Course – Individual")).toEqual(want);
    expect(parseOption("Live - Full Course - Individual")).toEqual(want);
    expect(parseOption("live — full course – group of 3")).toEqual(want);
  });
  it("reads modules", () => {
    expect(parseOption("Recorded — Modules: M1 – Individual")).toEqual({
      mode: "recorded", full: false, modules: [1],
    });
    expect(parseOption("Live — Modules: M1, M2 – Individual").modules).toEqual([1, 2]);
  });
  it("marks unrecognised labels unknown", () => {
    const want = { mode: "unknown", full: false, modules: [] };
    expect(parseOption("")).toEqual(want);
    expect(parseOption("Webinar seat")).toEqual(want);
  });
});

describe("matchAudience", () => {
  const live1 = presetLiveWithModule(1);
  const liveFull = parseOption("Live — Full Course – Individual");
  const liveM1 = parseOption("Live — Modules: M1 – Individual");
  const liveM4 = parseOption("Live — Modules: M4 – Individual");
  const recFull = parseOption("Recorded — Full Course – Individual");
  const unknown = parseOption("Webinar seat");

  it("live + module 1", () => {
    expect(matchAudience(liveFull, live1)).toEqual({ include: true });
    expect(matchAudience(liveM1, live1)).toEqual({ include: true });
    expect(matchAudience(liveM4, live1)).toEqual({ include: false, reason: "wrong_module" });
    expect(matchAudience(recFull, live1)).toEqual({ include: false, reason: "recorded" });
    expect(matchAudience(unknown, live1)).toEqual({ include: false, reason: "unrecognised" });
  });
  it("presets", () => {
    const allLive = AUDIENCE_PRESETS.find((p) => p.key === "all_live")!.audience;
    const everyone = AUDIENCE_PRESETS.find((p) => p.key === "everyone")!.audience;
    expect(AUDIENCE_PRESETS).toHaveLength(2);
    expect(matchAudience(liveM4, allLive)).toEqual({ include: true });
    expect(matchAudience(recFull, allLive)).toEqual({ include: false, reason: "recorded" });
    expect(matchAudience(recFull, everyone)).toEqual({ include: true });
    expect(matchAudience(unknown, everyone)).toEqual({ include: false, reason: "unrecognised" });
  });
});

describe("audienceFromJson", () => {
  it("accepts valid and rejects malformed", () => {
    expect(audienceFromJson({ mode: "live", modules: [1] })).toEqual({ mode: "live", modules: [1] });
    expect(audienceFromJson({ mode: "any", modules: "all" })).toEqual({ mode: "any", modules: "all" });
    expect(audienceFromJson({ mode: "x" })).toBeNull();
    expect(audienceFromJson({ mode: "live", modules: ["a"] })).toBeNull();
    expect(audienceFromJson(null)).toBeNull();
    expect(audienceFromJson("a")).toBeNull();
  });
});

describe("optionPatterns", () => {
  it("full matches full course labels", () => {
    expect(matchesAny(optionPatterns("full"), "Live — Full Course – Individual")).toBe(true);
    expect(matchesAny(optionPatterns("full"), "Live — Modules: M1 – Individual")).toBe(false);
  });
  it("module 1 matches M1 only as a whole number", () => {
    const p = optionPatterns(1);
    expect(matchesAny(p, "Live — Modules: M1 – Individual")).toBe(true);
    expect(matchesAny(p, "Live — Modules: M1, M2 – Individual")).toBe(true);
    expect(matchesAny(p, "Live — Modules: M2, M1 – Individual")).toBe(true);
    expect(matchesAny(p, "Live — Modules: M2, M1")).toBe(true);
    expect(matchesAny(p, "Live — Modules: M10, M12 – Individual")).toBe(false);
    expect(matchesAny(p, "Live — Modules: M10")).toBe(false);
  });
  it("agrees with parseOption", () => {
    for (const l of ["Live — Modules: M1 – X", "Live — Modules: M3, M1 – X", "Live — Modules: M10, M12 – X"]) {
      expect(matchesAny(optionPatterns(1), l)).toBe(parseOption(l).modules.includes(1));
    }
  });
});

describe("unreadable labels", () => {
  const presets = AUDIENCE_PRESETS.map((x) => x.audience);
  it("are unknown and never included", () => {
    for (const l of ["Live — Workshop", "Live — Modules M1", "Recorded — Workshop", "Recorded — Modules M1"]) {
      const o = parseOption(l);
      expect(o).toEqual({ mode: "unknown", full: false, modules: [] });
      for (const a of presets) {
        expect(matchAudience(o, a)).toEqual({ include: false, reason: "unrecognised" });
      }
    }
  });
  it("only reads a module number ending at a comma, space or end", () => {
    expect(parseOption("Live — Modules: M1–Individual")).toEqual({ mode: "unknown", full: false, modules: [] });
    expect(parseOption("Live — Modules: M1 – Individual").modules).toEqual([1]);
    expect(parseOption("Live — Modules: M1, M2 – Individual").modules).toEqual([1, 2]);
    expect(parseOption("Live — Modules: M2, M1").modules).toEqual([2, 1]);
  });
});
