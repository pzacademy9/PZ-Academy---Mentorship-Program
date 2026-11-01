import type { KahootRow } from "@/lib/quiz/kahoot-parse";
import type { AliasMap } from "@/lib/quiz/match";
import { normalizePzId } from "@/lib/pzid/format";
import {
  EMPTY_CHOICES,
  acceptLikely,
  bulkSkipZero,
  buildBase,
  computeReview,
  decisionsFromChoices,
  initialChoices,
  resolveReview,
  type Choices,
  type PersonInfo,
  type PriorDecision,
} from "@/lib/quiz/review";

let line = 3;
const row = (player: string, score: number, correct = 0, incorrect = 0, hint = ""): KahootRow => ({
  line: ++line,
  rank: null,
  player,
  score,
  correct,
  incorrect,
  hint,
});

const person = (personId: string, pzId: string, name: string, mode: PersonInfo["mode"] = "live"): PersonInfo => ({ personId, pzId, name, mode });
const hamid = person("p-hamid", "Hamid-4821", "Hamid Khan");
const sidra = person("p-sidra", "Sidra-KU42", "Sidra Ali");
const sami = person("p-sami", "Sami-FUUAST89", "Sami Ullah");
const rec = person("p-rec", "Rana-1111", "Rana Bibi", "recorded");
const stranger = person("p-str", "Zed-9999", "Zed Zed", null);
const people = new Map([hamid, sidra, sami, rec, stranger].map((p) => [p.personId, p]));
const aliases: AliasMap = new Map([
  ["hamid-4821", "p-hamid"],
  ["sidra-ku42", "p-sidra"],
  ["sami-fuuast89", "p-sami"],
  ["rana-1111", "p-rec"],
  ["zed-9999", "p-str"],
]);

const make = (rows: KahootRow[], decisions: PriorDecision[] = [], q: number | null = null) => buildBase(rows, aliases, people, decisions, q);
const choices = (c: Partial<Choices>): Choices => ({ ...EMPTY_CHOICES, ...c });

beforeEach(() => { line = 3; });

describe("duplicates", () => {
  it("exact + rejoin rows of one person form one duplicate; merge adds, keep one keeps", () => {
    const base = make([row("Hamid-4821", 500, 5, 5), row("Hamid-4821n", 300, 3, 2)]);
    const review = computeReview(base, EMPTY_CHOICES);
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ type: "duplicate", choice: null });
    expect(review.undecided).toBe(1);
    expect(resolveReview(base, EMPTY_CHOICES)).toEqual({ ok: false, undecided: 1 });

    const merged = resolveReview(base, choices({ duplicate: { "p-hamid": "merge" } }));
    expect(merged).toMatchObject({ ok: true, rows: [{ personId: "p-hamid", score: 800, correct: 8, incorrect: 7 }], summary: { saved: 1, merged: 1, dropped: 0, skipped: 0 } });

    const keep = resolveReview(base, choices({ duplicate: { "p-hamid": { keep: 5 } } }));
    expect(keep).toMatchObject({ ok: true, rows: [{ score: 300 }], summary: { saved: 1, merged: 0, dropped: 1 } });
  });

  it("three rows for one person work", () => {
    const base = make([row("Hamid-4821", 100), row("Hamid-4821n", 200), row("hamid-4821nn", 300)]);
    const r = resolveReview(base, choices({ duplicate: { "p-hamid": "merge" } }));
    expect(r).toMatchObject({ ok: true, rows: [{ score: 600 }], summary: { saved: 1, merged: 2 } });
  });

  it("suggests keeping the only scored row (real file: Sidra 14759 + ghost 0) without applying it", () => {
    const base = make([row("Sidra-KU42 ", 14759, 16, 4), row("Sidra-KU42", 0, 0, 20)]);
    const item = computeReview(base, EMPTY_CHOICES).items[0];
    expect(item).toMatchObject({ type: "duplicate", choice: null, suggested: { keep: 4 } });
  });

  it("an out-of-date keep choice (row no longer in the file) counts as undecided", () => {
    const base = make([row("Hamid-4821", 1), row("Hamid-4821n", 2)]);
    expect(computeReview(base, choices({ duplicate: { "p-hamid": { keep: 99 } } })).undecided).toBe(1);
  });
});

describe("unknown players", () => {
  it("suggests by letters-and-digits form and by name, never applies", () => {
    const base = make([row("Sami_FUUAST89", 900), row("Tooba", 0, 0, 20, "Hamid Khan")]);
    const items = computeReview(base, EMPTY_CHOICES).items;
    expect(items[0]).toMatchObject({ type: "unknown", choice: null });
    expect((items[0] as { suggestions: PersonInfo[] }).suggestions[0].personId).toBe("p-sami");
    expect((items[1] as { suggestions: PersonInfo[] }).suggestions[0].personId).toBe("p-hamid");
    expect(resolveReview(base, EMPTY_CHOICES)).toEqual({ ok: false, undecided: 2 });
  });

  it("a row with nothing similar has an empty suggestion list", () => {
    const base = make([row("Qqqq", 10)]);
    expect((computeReview(base, EMPTY_CHOICES).items[0] as { suggestions: unknown[] }).suggestions).toEqual([]);
  });

  it("assigning an unknown row to a person who already has a row creates a duplicate", () => {
    const base = make([row("Sami-FUUAST89", 500), row("Sami_FUUAST89", 400)]);
    const c = choices({ unknown: { "5": { personId: "p-sami" } } });
    const review = computeReview(base, c);
    expect(review.items.map((i) => i.type).sort()).toEqual(["duplicate", "unknown"]);
    expect(resolveReview(base, c)).toEqual({ ok: false, undecided: 1 });
    expect(resolveReview(base, { ...c, duplicate: { "p-sami": "merge" } })).toMatchObject({ ok: true, rows: [{ score: 900 }] });
  });

  it("bulkSkipZero skips only unknown rows with 0 points", () => {
    const base = make([row("Zeb", 0, 0, 20), row("Saira", 10824), row("Hamid-4821", 0)]);
    const c = bulkSkipZero(base, EMPTY_CHOICES);
    expect(c.unknown).toEqual({ "4": "skip" });
    expect(computeReview(base, c).undecided).toBe(1); // Saira still needs the admin
  });
});

describe("batch membership and recorded students", () => {
  it("a person not in this batch needs include or skip", () => {
    const base = make([row("Zed-9999", 50)]);
    expect(computeReview(base, EMPTY_CHOICES).items[0]).toMatchObject({ type: "not_in_batch", choice: null });
    expect(resolveReview(base, choices({ notInBatch: { "p-str": "skip" } }))).toMatchObject({ ok: true, rows: [], summary: { skipped: 1 } });
    expect(resolveReview(base, choices({ notInBatch: { "p-str": "include" } }))).toMatchObject({ ok: true, rows: [{ personId: "p-str" }] });
  });

  it("recorded rows are saved and tagged in the clean list", () => {
    const base = make([row("Rana-1111", 70)]);
    const review = computeReview(base, EMPTY_CHOICES);
    expect(review.clean[0].person.mode).toBe("recorded");
    expect(resolveReview(base, EMPTY_CHOICES)).toMatchObject({ ok: true, rows: [{ personId: "p-rec", score: 70 }] });
  });

  it("marks rejoin rows as such in the clean list", () => {
    const review = computeReview(make([row("Hamid-4821nn", 9)]), EMPTY_CHOICES);
    expect(review.clean[0]).toMatchObject({ rejoin: true });
  });
});

describe("remembered decisions", () => {
  it("pre-apply an alias, a skip and a duplicate choice", () => {
    const rows = [row("Hamid-4821", 100), row("Hamid-4821n", 0), row("Sami_FUUAST89", 5), row("Zeb", 0)];
    const decisions: PriorDecision[] = [
      { kind: "alias", key: "sami_fuuast89", choice: "", personId: "p-sami" },
      { kind: "skip", key: "zeb", choice: "", personId: null },
      { kind: "duplicate", key: "p-hamid", choice: "keep:hamid-4821|100", personId: "p-hamid" },
    ];
    const base = make(rows, decisions);
    expect(base.prior.unknown).toEqual({ "6": { personId: "p-sami" }, "7": "skip" });
    expect(base.prior.duplicate).toEqual({ "p-hamid": { keep: 4 } });
    expect(resolveReview(base, base.prior)).toMatchObject({ ok: true, summary: { saved: 2, dropped: 1, skipped: 1 } });
  });

  it("round-trips through decisionsFromChoices", () => {
    const rows = [row("Hamid-4821", 100), row("Hamid-4821n", 0), row("Sami_FUUAST89", 5), row("Zeb", 0)];
    const base = make(rows);
    const c = choices({ unknown: { "6": { personId: "p-sami" }, "7": "skip" }, duplicate: { "p-hamid": "merge" } });
    const d = decisionsFromChoices(base, c);
    expect(d).toEqual(
      expect.arrayContaining([
        { kind: "alias", key: "sami_fuuast89", choice: "", personId: "p-sami" },
        { kind: "skip", key: "zeb", choice: "", personId: null },
        { kind: "duplicate", key: "p-hamid", choice: "merge", personId: "p-hamid" },
      ]),
    );
    expect(make(rows, d).prior).toEqual(c);
  });

  it("an alias decision pointing at a person who is gone is ignored", () => {
    const base = make([row("Zeb", 3)], [{ kind: "alias", key: "zeb", choice: "", personId: "p-gone" }]);
    expect(base.prior.unknown).toEqual({});
  });
});

describe("summary and maximum", () => {
  it("accounts for every file row on a 10-row file", () => {
    const rows = [
      row("Hamid-4821", 100), row("Hamid-4821n", 50), // merge: saved 1, merged 1
      row("Sidra-KU42", 70), row("sidra-ku42", 0), // keep one: saved 1, dropped 1
      row("Zeb", 0), // skip
      row("Sami-FUUAST89", 40),
      row("Rana-1111", 30),
      row("Qqq", 0), row("Www", 0), row("Eee", 0), // skip x3
    ];
    const base = make(rows);
    const c = bulkSkipZero(base, choices({ duplicate: { "p-hamid": "merge", "p-sidra": { keep: 6 } } }));
    const r = resolveReview(base, c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { saved, merged, dropped, skipped } = r.summary;
    expect({ saved, merged, dropped, skipped }).toEqual({ saved: 4, merged: 1, dropped: 1, skipped: 4 });
    expect(saved + merged + dropped + skipped).toBe(rows.length);
  });

  it("maxScoreDefault is questions x 1000, but never below the top (merged) score", () => {
    expect(computeReview(make([row("Hamid-4821", 15090)], [], 20), EMPTY_CHOICES).maxScoreDefault).toBe(20000);
    expect(computeReview(make([row("Hamid-4821", 15090)], [], null), EMPTY_CHOICES).maxScoreDefault).toBe(15090);
    const base = make([row("Hamid-4821", 15000), row("Hamid-4821n", 9000)], [], 20);
    expect(computeReview(base, choices({ duplicate: { "p-hamid": "merge" } })).maxScoreDefault).toBe(24000);
  });
});

describe("automatic matching", () => {
  it("a near-exact ID typo is matched for you and needs no answer", () => {
    const base = make([row("Sami_FUUAST89", 900)]);
    expect(base.auto.unknown).toEqual({ "4": { personId: "p-sami" } });
    const start = initialChoices(base);
    expect(computeReview(base, start).undecided).toBe(0);
    expect(resolveReview(base, start)).toMatchObject({ ok: true, rows: [{ personId: "p-sami", score: 900 }] });
  });

  it("a fairly sure match is only a best guess until accepted, and accepting never changes an answer already given", () => {
    const base = make([row("Hamid-482", 500), row("Sidra-KU4", 300)]);
    expect(base.likely.unknown).toEqual({ "4": { personId: "p-hamid" }, "5": { personId: "p-sidra" } });
    expect(base.auto.unknown).toEqual({});
    const start = initialChoices(base);
    expect(computeReview(base, start).undecided).toBe(2);
    const mine = choices({ unknown: { "4": "skip" } });
    expect(acceptLikely(base, mine).unknown).toEqual({ "4": "skip", "5": { personId: "p-sidra" } });
    const all = acceptLikely(base, start);
    expect(computeReview(base, all).undecided).toBe(0);
    expect(resolveReview(base, all)).toMatchObject({ ok: true, rows: [{ personId: "p-hamid" }, { personId: "p-sidra" }] });
  });

  it("an unknown player with no points and no match is skipped for you; one with points waits", () => {
    const base = make([row("Zeb", 0), row("Saira", 9000)]);
    expect(base.auto.unknown).toEqual({ "4": "skip" });
    expect(computeReview(base, initialChoices(base)).undecided).toBe(1);
  });

  it("a student outside this batch is skipped for you", () => {
    const base = make([row("Zed-9999", 50)]);
    expect(base.auto.notInBatch).toEqual({ "p-str": "skip" });
    expect(resolveReview(base, initialChoices(base))).toMatchObject({ ok: true, rows: [], summary: { saved: 0, skipped: 1 } });
  });

  it("played twice with one scored row keeps the scored row for you; both scored is only a best guess to add together", () => {
    const one = make([row("Hamid-4821", 500), row("Hamid-4821n", 0)]);
    expect(one.auto.duplicate).toEqual({ "p-hamid": { keep: 4 } });
    expect(resolveReview(one, initialChoices(one))).toMatchObject({ ok: true, rows: [{ score: 500 }], summary: { dropped: 1 } });
    line = 3;
    const both = make([row("Hamid-4821", 500), row("Hamid-4821n", 300)]);
    expect(both.auto.duplicate).toEqual({});
    expect(both.likely.duplicate).toEqual({ "p-hamid": "merge" });
    expect(computeReview(both, initialChoices(both)).undecided).toBe(1);
    expect(resolveReview(both, acceptLikely(both, initialChoices(both)))).toMatchObject({ ok: true, rows: [{ score: 800 }] });
  });

  it("a best guess that makes someone play twice has its duplicate answered in the same click", () => {
    const base = make([row("Hamid-4821", 500), row("Hamid-482", 0)]);
    expect(base.likely.unknown["5"]).toEqual({ personId: "p-hamid" });
    expect(base.likely.duplicate).toEqual({ "p-hamid": { keep: 4 } });
    expect(resolveReview(base, acceptLikely(base, initialChoices(base)))).toMatchObject({ ok: true, rows: [{ score: 500 }] });
  });

  it("what the admin chose last time wins over the app's own answer", () => {
    const key = normalizePzId("Sami_FUUAST89");
    const base = make([row("Sami_FUUAST89", 900)], [{ kind: "skip", key, choice: "", personId: null }]);
    expect(base.auto.unknown).toEqual({});
    expect(initialChoices(base).unknown).toEqual({ "4": "skip" });
  });
});

describe("first names and ID numbers typed alone", () => {
  const ali1 = person("p-ali1", "Ali-1069", "Ali Raza");
  const ali2 = person("p-ali2", "Ali-2288", "Ali Hassan");
  const noor = person("p-noor", "Noor-7345", "Noor Fatima");
  const crowd = new Map([ali1, ali2, noor, hamid].map((p) => [p.personId, p]));
  const crowdAliases: AliasMap = new Map([["ali-1069", "p-ali1"], ["ali-2288", "p-ali2"], ["noor-7345", "p-noor"], ["hamid-4821", "p-hamid"]]);
  const build = (rows: KahootRow[]) => buildBase(rows, crowdAliases, crowd, [], null);

  it("only the number of an ID typed (1069) is matched for you when one student has that number", () => {
    const base = build([row("1069", 800)]);
    expect(base.auto.unknown).toEqual({ "4": { personId: "p-ali1" } });
    expect(resolveReview(base, initialChoices(base))).toMatchObject({ ok: true, rows: [{ personId: "p-ali1", score: 800 }] });
  });

  it("a first name typed alone is matched for you when only one student has it", () => {
    const base = build([row("Noor", 400), row("hamid", 300)]);
    expect(base.auto.unknown).toEqual({ "4": { personId: "p-noor" }, "5": { personId: "p-hamid" } });
    expect(base.ambiguous).toEqual({});
  });

  it("two students with the same first name are never picked by the app: it asks, and offers both", () => {
    const base = build([row("Ali", 500)]);
    expect(base.auto.unknown).toEqual({});
    expect(base.likely.unknown).toEqual({});
    expect(base.ambiguous).toEqual({ "4": true });
    expect(computeReview(base, initialChoices(base)).items[0]).toMatchObject({ type: "unknown", choice: null });
    expect((base.suggestions["4"] ?? []).slice().sort()).toEqual(["p-ali1", "p-ali2"]);
    expect(computeReview(base, initialChoices(base)).undecided).toBe(1);
  });

  it("an ambiguous player with no points is still asked, not silently skipped", () => {
    const base = build([row("Ali", 0)]);
    expect(base.auto.unknown).toEqual({});
    expect(computeReview(base, initialChoices(base)).undecided).toBe(1);
  });

  it("a number that two students share is not matched for you", () => {
    const twin = person("p-twin", "Zara-1069", "Zara Noor");
    const base = buildBase([row("1069", 10)], new Map([["ali-1069", "p-ali1"], ["zara-1069", "p-twin"]]), new Map([ali1, twin].map((p) => [p.personId, p])), [], null);
    expect(base.auto.unknown).toEqual({});
    expect(base.ambiguous).toEqual({ "4": true });
  });

  it("a first name plus surname still works, and a first name does not match a different first name", () => {
    const base = build([row("Ali Raza", 100), row("Alina", 50)]);
    expect(base.auto.unknown["4"]).toEqual({ personId: "p-ali1" });
    expect(base.auto.unknown["5"]).toBeUndefined();
  });
});
