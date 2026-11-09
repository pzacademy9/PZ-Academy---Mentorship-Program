import { describe, it, expect } from "vitest";
import { cleanReportAudience, matchesReportAudience, describeReportAudience, pickReportRecipients, type ReportAudience } from "@/lib/progress/report-audience";

const aud = (who: ReportAudience["who"], part: ReportAudience["part"]): ReportAudience => ({ who, part });
const ALL = { kind: "all" } as const;
const FULL = { kind: "full" } as const;
const mods = (modules: number[], withFull = true) => ({ kind: "modules" as const, modules, withFull });

const liveFull = ["Live - Full Course"];
const liveM2M5 = ["Live - Modules: M2, M5"];
const recFull = ["Recorded - Full Course"];
const recM2 = ["Recorded - Modules: M2"];

describe("matchesReportAudience", () => {
  it("both + everyone matches all, even an unreadable label or no registration", () => {
    expect(matchesReportAudience([""], aud("both", ALL))).toBe(true);
    expect(matchesReportAudience([], aud("both", ALL))).toBe(true);
  });
  it("live + everyone leaves recorded and unreadable people out", () => {
    expect(matchesReportAudience(liveFull, aud("live", ALL))).toBe(true);
    expect(matchesReportAudience(recFull, aud("live", ALL))).toBe(false);
    expect(matchesReportAudience([""], aud("live", ALL))).toBe(false);
  });
  it("recorded + everyone takes only recorded people", () => {
    expect(matchesReportAudience(recM2, aud("recorded", ALL))).toBe(true);
    expect(matchesReportAudience(liveM2M5, aud("recorded", ALL))).toBe(false);
  });
  it("full course only keeps the type", () => {
    expect(matchesReportAudience(liveFull, aud("live", FULL))).toBe(true);
    expect(matchesReportAudience(recFull, aud("live", FULL))).toBe(false);
    expect(matchesReportAudience(liveM2M5, aud("live", FULL))).toBe(false);
    expect(matchesReportAudience(recFull, aud("both", FULL))).toBe(true);
  });
  it("a module with full course takes module students AND full course students of that type", () => {
    const a = aud("live", mods([5]));
    expect(matchesReportAudience(liveM2M5, a)).toBe(true);
    expect(matchesReportAudience(liveFull, a)).toBe(true);
    expect(matchesReportAudience(recFull, a)).toBe(false);
    expect(matchesReportAudience(["Live - Modules: M2, M3"], a)).toBe(false);
    expect(matchesReportAudience(["Live - Modules: M12"], aud("live", mods([1])))).toBe(false);
  });
  it("module only leaves full course students out", () => {
    const a = aud("live", mods([5], false));
    expect(matchesReportAudience(liveM2M5, a)).toBe(true);
    expect(matchesReportAudience(liveFull, a)).toBe(false);
  });
  it("one registration must match the type AND the part (no mixing across registrations)", () => {
    // live Module 3 + recorded Module 2: "live Module 2" must NOT match.
    expect(matchesReportAudience(["Live - Modules: M3", "Recorded - Modules: M2"], aud("live", mods([2])))).toBe(false);
    expect(matchesReportAudience(["Live - Modules: M3", "Recorded - Modules: M2"], aud("recorded", mods([2])))).toBe(true);
  });
});

describe("pickReportRecipients", () => {
  const s = (personId: string, email: string, labels: string[]) => ({ personId, email, labels });
  it("keeps one row per person and per inbox, and skips people with no email", () => {
    const list = [
      s("p1", "a@x.com", liveFull),
      s("p1", "a@x.com", liveFull),
      s("p2", "A@X.com ", liveM2M5),
      s("p3", "", liveFull),
      s("p4", "b@x.com", liveFull),
    ];
    expect(pickReportRecipients(list, aud("live", ALL)).map((x) => x.personId)).toEqual(["p1", "p4"]);
  });
  it("a full course student of a module batch is counted once", () => {
    const list = [s("p1", "a@x.com", ["Live - Full Course", "Live - Modules: M2"])];
    expect(pickReportRecipients(list, aud("live", mods([2])))).toHaveLength(1);
  });
});

describe("cleanReportAudience", () => {
  it("accepts the shapes and rejects anything else", () => {
    expect(cleanReportAudience(undefined)).toEqual(aud("both", ALL));
    expect(cleanReportAudience(aud("live", ALL))).toEqual(aud("live", ALL));
    expect(cleanReportAudience(aud("recorded", FULL))).toEqual(aud("recorded", FULL));
    expect(cleanReportAudience(aud("live", mods([3, 3, 1])))).toEqual(aud("live", mods([1, 3])));
    expect(cleanReportAudience(aud("live", mods([])))).toBeNull();
    expect(cleanReportAudience(aud("live", mods([0])))).toBeNull();
    expect(cleanReportAudience(aud("live", mods([13])))).toBeNull();
    expect(cleanReportAudience({ who: "live", part: { kind: "modules", modules: [2] } })).toBeNull();
    expect(cleanReportAudience({ who: "nobody", part: { kind: "all" } })).toBeNull();
    expect(cleanReportAudience({ kind: "all" })).toBeNull();
  });
});

describe("describeReportAudience", () => {
  it("says the group in plain words", () => {
    expect(describeReportAudience(aud("both", ALL))).toBe("everyone in the batch");
    expect(describeReportAudience(aud("live", ALL))).toBe("all live students");
    expect(describeReportAudience(aud("recorded", FULL))).toBe("recorded full course students");
    expect(describeReportAudience(aud("live", mods([2, 5])))).toBe("live students of module 2, 5, plus full course students");
    expect(describeReportAudience(aud("both", mods([2], false)))).toBe("students of module 2 only, not full course");
  });
});
