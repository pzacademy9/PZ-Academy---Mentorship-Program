import type { KahootRow } from "@/lib/quiz/kahoot-parse";
import type { AliasMap } from "@/lib/quiz/match";
import {
  EMPTY_CHOICES,
  bulkSkipZero,
  buildBase,
  computeReview,
  decisionsFromChoices,
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
