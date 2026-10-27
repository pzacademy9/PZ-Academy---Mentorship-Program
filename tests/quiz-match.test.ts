import { matchPlayer, type AliasMap } from "@/lib/quiz/match";

const aliases: AliasMap = new Map([
  ["hamid-4821", "p-hamid"],
  ["sana-dr", "p-sana"],
  ["jon-ann", "p-jon"],
  ["jon-an", "p-other"],
]);

describe("matchPlayer", () => {
  it("matches an exact ID, ignoring case and spaces", () => {
    for (const raw of ["Hamid-4821", "hamid-4821", " HAMID - 4821 "]) {
      expect(matchPlayer(raw, aliases)).toEqual({ kind: "exact", personId: "p-hamid" });
    }
  });

  it("reads trailing n as a rejoin and reports how many were stripped", () => {
    expect(matchPlayer("Hamid-4821n", aliases)).toEqual({ kind: "rejoin", personId: "p-hamid", stripped: 1 });
    expect(matchPlayer("hamid-4821nn", aliases)).toEqual({ kind: "rejoin", personId: "p-hamid", stripped: 2 });
    expect(matchPlayer("Hamid-4821 n", aliases)).toEqual({ kind: "rejoin", personId: "p-hamid", stripped: 1 });
  });

  it("an exact alias that ends in letters is not stripped", () => {
    expect(matchPlayer("Sana-Dr", aliases)).toEqual({ kind: "exact", personId: "p-sana" });
    expect(matchPlayer("Sana-Drn", aliases)).toEqual({ kind: "rejoin", personId: "p-sana", stripped: 1 });
  });

  it("exact wins over a shorter alias reachable by stripping", () => {
    expect(matchPlayer("jon-ann", aliases)).toEqual({ kind: "exact", personId: "p-jon" });
    expect(matchPlayer("jon-annn", aliases)).toEqual({ kind: "rejoin", personId: "p-jon", stripped: 1 });
  });

  it("never strips to an empty string and does nothing else fuzzy", () => {
    for (const raw of ["n", "nnn", "", "   ", "Hamid-4821x", "Hamid-4822"]) {
      expect(matchPlayer(raw, aliases)).toEqual({ kind: "unknown" });
    }
  });
});
