import { describe, expect, it } from "vitest";
import {
  gapFor,
  gapLine,
  monthStartPkt,
  publicName,
  rankAffiliates,
  rankTeams,
  shareText,
  windowFor,
  type BoardRow,
} from "@/lib/affiliates/leaderboard";

const row = (id: string, name: string, paid: number, registered: number, team: BoardRow["team"] = null): BoardRow => ({
  affiliateId: id,
  name,
  team,
  registered,
  paid,
});

describe("month window", () => {
  it("starts the month at 00:00 Pakistan time", () => {
    expect(monthStartPkt(new Date("2026-11-30T20:00:00Z")).toISOString()).toBe("2026-11-30T19:00:00.000Z");
    expect(monthStartPkt(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-10-31T19:00:00.000Z");
  });
  it("has no window for all time", () => {
    const d = new Date("2026-11-15T10:00:00Z");
    expect(windowFor("all", d)).toBeNull();
    expect(windowFor("month", d)?.toISOString()).toBe("2026-10-31T19:00:00.000Z");
  });
});

describe("publicName", () => {
  it("shows first name and last initial", () => {
    expect(publicName("Dr. Ali  Khan")).toBe("Ali K.");
    expect(publicName("Madonna")).toBe("Madonna");
    expect(publicName("   ")).toBe("Affiliate");
    expect(publicName("Ali Khan-Reza")).toBe("Ali K.");
    expect(publicName("M. Ali Khan")).toBe("Ali K.");
    expect(publicName("Ali Khan (PZ)")).toBe("Ali K.");
    expect(publicName("Dr. Ali Khan")).toBe("Ali K.");
    expect(publicName("Ali")).toBe("Ali");
    expect(publicName("Dr")).toBe("Affiliate");
    expect(publicName("Prof.")).toBe("Affiliate");
    expect(publicName("")).toBe("Affiliate");
  });
});

describe("rankAffiliates", () => {
  it("orders by paid, registered, name and shares ties", () => {
    const out = rankAffiliates([row("d", "Dan", 2, 1), row("c", "Cara", 5, 4), row("b", "Bina", 5, 9), row("a", "Ali", 5, 9)]);
    expect(out.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
    expect(out.map((r) => r.affiliateId)).toEqual(["a", "b", "c", "d"]);
    expect(out[0].publicName).toBe("Ali");
  });
  it("keeps zero-paid affiliates", () => {
    const out = rankAffiliates([row("a", "Ali", 0, 0), row("b", "Bina", 0, 0), row("c", "Cara", 1, 1)]);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2]);
  });
});

describe("rankTeams", () => {
  it("rewards paid per active member, not size", () => {
    const rows: BoardRow[] = [row("b1", "B One", 1, 1, "Blue"), ...Array.from({ length: 19 }, (_, i) => row(`b${i + 2}`, `B ${i}`, 0, 0, "Blue")), row("p1", "P One", 3, 3, "Pink"), row("p2", "P Two", 3, 3, "Pink")];
    const out = rankTeams(rows);
    const pink = out.find((t) => t.team === "Pink")!;
    const blue = out.find((t) => t.team === "Blue")!;
    expect(blue.members).toBe(20);
    expect(blue.active).toBe(1);
    expect(pink.score).toBe(3);
    expect(pink.rank).toBeLessThan(blue.rank);
  });
  it("ranks zero-active teams last with score 0 and returns all five", () => {
    const out = rankTeams([row("g", "Gee", 0, 0, "Green"), row("y", "Why", 2, 2, "Yellow")]);
    expect(out).toHaveLength(5);
    expect(out[0].team).toBe("Yellow");
    const green = out.find((t) => t.team === "Green")!;
    expect(green.score).toBe(0);
    expect(green.rank).toBeGreaterThan(out[0].rank);
    expect(out.slice(1).map((t) => t.team)).toEqual(["Green", "White", "Blue", "Pink"]);
  });
  it("returns all five for empty input and ignores no-team rows", () => {
    expect(rankTeams([])).toHaveLength(5);
    const out = rankTeams([row("n", "No Team", 9, 9, null)]);
    expect(out.every((t) => t.paid === 0 && t.members === 0 && t.score === 0)).toBe(true);
  });
});

describe("gapFor / gapLine", () => {
  it("chases a strictly higher paid", () => {
    const r = rankAffiliates([row("a", "Ali Khan", 5, 5), row("b", "Bina Raza", 3, 3)]);
    expect(gapFor(r, "b")).toEqual({ kind: "chase", more: 3, target: "Ali K.", rank: 1 });
  });
  it("counts a pass that only brings paid level as one more", () => {
    const tie = rankAffiliates([row("a", "Ali Khan", 5, 5), row("b", "Bina Raza", 3, 3)]);
    expect(gapFor(tie, "b")).toMatchObject({ kind: "chase", more: 3 });
    const ahead = rankAffiliates([row("a", "Ali Khan", 5, 5), row("b", "Bina Raza", 3, 6)]);
    expect(gapFor(ahead, "b")).toMatchObject({ kind: "chase", more: 2 });
  });
  it("does not name a runner-up with no paid sale", () => {
    const r = rankAffiliates([row("a", "Ali Khan", 5, 5), row("z", "Zed Q", 0, 0)]);
    expect(gapFor(r, "a")).toEqual({ kind: "first", ahead: 5, of: null });
  });
  it("needs one more when paid is equal but registered is lower", () => {
    const r = rankAffiliates([row("a", "Ali Khan", 3, 9), row("b", "Bina Raza", 3, 3)]);
    expect(gapFor(r, "b")).toEqual({ kind: "chase", more: 1, target: "Ali K.", rank: 1 });
  });
  it("describes first place", () => {
    const r = rankAffiliates([row("a", "Ali Khan", 5, 5), row("b", "Bina Raza", 2, 3)]);
    expect(gapFor(r, "a")).toEqual({ kind: "first", ahead: 3, of: "Bina R." });
    expect(gapFor(rankAffiliates([row("a", "Ali Khan", 5, 5)]), "a")).toEqual({ kind: "first", ahead: 0, of: null });
  });
  it("handles unknown id and zero paid", () => {
    const r = rankAffiliates([row("a", "Ali Khan", 5, 5), row("z", "Zed", 0, 0)]);
    expect(gapFor(r, "nope")).toBeNull();
    expect(gapFor(r, "z")).toEqual({ kind: "none" });
  });
  it("writes plain lines", () => {
    expect(gapLine({ kind: "chase", more: 2, target: "Ali K.", rank: 1 })).toBe("2 more paid sales to pass Ali K.");
    expect(gapLine({ kind: "chase", more: 1, target: "Ali K.", rank: 1 })).toBe("1 more paid sale to pass Ali K.");
    expect(gapLine({ kind: "first", ahead: 3, of: "Bina R." })).toBe("You are first, 3 ahead of Bina R.");
    expect(gapLine({ kind: "first", ahead: 0, of: "Bina R." })).toBe("You are first, level with Bina R.");
    expect(gapLine({ kind: "first", ahead: 0, of: null })).toBe("You are first.");
    expect(gapLine({ kind: "none" })).toBe("Get your first paid sale to join the race.");
  });
});

describe("shareText", () => {
  const rows = [row("a", "Ali Khan", 12, 20, "Blue"), row("b", "Bina Raza", 4, 5, "Pink")];
  const top = rankAffiliates(rows);
  const teams = rankTeams(rows);
  it("builds a plain WhatsApp text", () => {
    const month = shareText({ period: "month", top, teams, boardUrl: "https://x.test/board/abc" });
    expect(month).toContain("This month");
    expect(month).toContain("1. Ali K. (Blue) - 12 paid");
    expect(month).toContain("https://x.test/board/abc");
    expect(month).not.toMatch(/PKR|Rs|AED|SAR|\$/);
    expect(shareText({ period: "all", top, teams, boardUrl: "u" })).toContain("All time");
  });
  it("lists at most ten", () => {
    const many = rankAffiliates(Array.from({ length: 15 }, (_, i) => row(`i${i}`, `Name${String.fromCharCode(97 + i)} Last`, 20 - i, 1, "Green")));
    const text = shareText({ period: "all", top: many, teams: rankTeams(many), boardUrl: "u" });
    expect(text).toContain("10. ");
    expect(text).not.toContain("11. ");
  });
});
