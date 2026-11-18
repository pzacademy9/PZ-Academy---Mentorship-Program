import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUDIENCE_FILTER,
  AUDIENCE_MAX_PEOPLE,
  parseAudienceFilter,
  encodeAudienceFilter,
  decodeAudienceFilter,
  describeAudienceFilter,
  AUDIENCE_STATUSES,
  type AudienceFilter,
} from "@/lib/crm/audience-filter";

const filled: AudienceFilter = {
  courses: ["A", "B"],
  mode: "recorded",
  countries: ["AE", "SA"],
  statuses: ["paid"],
  from: "2026-01-01",
  to: "2026-02-01",
};

describe("audience filter", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_AUDIENCE_FILTER).toEqual({
      courses: [], mode: "either", countries: [], statuses: [], from: null, to: null,
    });
    expect(AUDIENCE_MAX_PEOPLE).toBe(50000);
  });

  it("accepts the default and empty arrays", () => {
    const r = parseAudienceFilter(DEFAULT_AUDIENCE_FILTER);
    expect(r).toEqual({ ok: true, filter: DEFAULT_AUDIENCE_FILTER });
  });

  it("trims course names", () => {
    const r = parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, courses: ["  A  "] });
    expect(r.ok && r.filter.courses).toEqual(["A"]);
  });

  it("rejects a bad country code", () => {
    const r = parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, countries: ["pk"] });
    expect(r.ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, countries: ["unknown", "PK"] }).ok).toBe(true);
  });

  it("rejects bad and impossible dates", () => {
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, from: "tomorrow" }).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, from: "2026-02-30" }).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, to: "2026-13-01" }).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, from: "2028-02-29" }).ok).toBe(true);
  });

  it("rejects an inverted range with a plain message", () => {
    const r = parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, from: "2026-03-01", to: "2026-02-01" });
    expect(r).toEqual({ ok: false, error: "The start date is after the end date." });
  });

  it("accepts a one-ended range", () => {
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, to: "2026-02-01" }).ok).toBe(true);
  });

  it("rejects 51 courses, 21 countries, empty or long course names", () => {
    const many = Array.from({ length: 51 }, (_, i) => `C${i}`);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, courses: many }).ok).toBe(false);
    const cs = Array.from({ length: 21 }, () => "PK");
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, countries: cs }).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, courses: ["  "] }).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, courses: ["x".repeat(201)] }).ok).toBe(false);
  });

  it("rejects non-objects and bad mode", () => {
    expect(parseAudienceFilter(null).ok).toBe(false);
    expect(parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, mode: "x" }).ok).toBe(false);
  });

  it("round-trips through encode and decode, including non-ASCII", () => {
    const f = { ...filled, courses: ["Pharmaco \u2013 \u0627\u0631\u062f\u0648"] };
    const s = encodeAudienceFilter(f);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAudienceFilter(s)).toEqual({ ok: true, filter: f });
  });

  it("decode fails on garbage and on over-long input", () => {
    expect(decodeAudienceFilter("!!!not base64!!!").ok).toBe(false);
    expect(decodeAudienceFilter("").ok).toBe(false);
    expect(decodeAudienceFilter("A".repeat(5000)).ok).toBe(false);
    expect(decodeAudienceFilter(encodeAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER }).slice(0, 5)).ok).toBe(false);
  });

  it("describes the default", () => {
    expect(describeAudienceFilter(DEFAULT_AUDIENCE_FILTER)).toEqual(["Everyone who registered or bought"]);
  });

  it("describes a filled filter", () => {
    expect(describeAudienceFilter(filled)).toEqual([
      "Courses: A, B",
      "Recorded only",
      "Countries: UAE, Saudi Arabia",
      "Paid",
      "From 2026-01-01",
      "To 2026-02-01",
    ]);
    expect(describeAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, mode: "live", statuses: ["reserved", "pending", "part_paid", "free"], countries: ["PK", "unknown", "GB"] })).toEqual([
      "Live only",
      "Countries: Pakistan, Not known, GB",
      "Reserved, Pending, Part-paid and Free",
    ]);
  });

  it("gives plain messages, never zod wording, for type errors", () => {
    const generic = "The audience choices are not valid.";
    const D = DEFAULT_AUDIENCE_FILTER;
    expect(parseAudienceFilter(null)).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, mode: "x" })).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, who: "everyone" })).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, statuses: ["paid", "refunded"] })).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, statuses: "paid" })).toEqual({ ok: false, error: generic });
    const { from: _from, ...noFrom } = D;
    void _from;
    expect(parseAudienceFilter(noFrom)).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, courses: "A" })).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, to: 5 })).toEqual({ ok: false, error: generic });
    expect(parseAudienceFilter({ ...D, from: "2026-02-30" })).toEqual({ ok: false, error: "Use a real date, like 2026-01-31." });
    expect(parseAudienceFilter({ ...D, countries: ["pk"] })).toEqual({ ok: false, error: "A country is not recognised." });
  });

  it("removes repeated courses (case-insensitive, first spelling kept) and countries", () => {
    const r = parseAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, courses: ["Alpha", " alpha ", "Beta", "ALPHA"], countries: ["PK", "AE", "PK"] });
    expect(r.ok && r.filter.courses).toEqual(["Alpha", "Beta"]);
    expect(r.ok && r.filter.countries).toEqual(["PK", "AE"]);
  });
});

describe("audience statuses", () => {
  const { statuses: _s, ...base } = DEFAULT_AUDIENCE_FILTER;
  void _s;

  it("lists the five statuses in the fixed order with plain labels", () => {
    expect(AUDIENCE_STATUSES).toEqual([
      { value: "paid", label: "Paid" },
      { value: "reserved", label: "Reserved" },
      { value: "pending", label: "Pending" },
      { value: "part_paid", label: "Part-paid" },
      { value: "free", label: "Free" },
    ]);
  });

  it("accepts the new shape and de-duplicates", () => {
    const r = parseAudienceFilter({ ...base, statuses: ["paid", "free", "paid"] });
    expect(r).toEqual({ ok: true, filter: { ...base, statuses: ["paid", "free"] } });
  });

  it("converts the old who field", () => {
    const f = (who: string) => {
      const r = parseAudienceFilter({ ...base, who });
      return r.ok ? r.filter : r;
    };
    expect(f("paid")).toEqual({ ...base, statuses: ["paid"] });
    expect(f("unpaid")).toEqual({ ...base, statuses: ["reserved", "pending", "part_paid", "free"] });
    expect(f("both")).toEqual({ ...base, statuses: [] });
    expect(Object.keys(f("paid"))).not.toContain("who");
  });

  it("lets statuses win over who", () => {
    const r = parseAudienceFilter({ ...base, who: "paid", statuses: ["free"] });
    expect(r).toEqual({ ok: true, filter: { ...base, statuses: ["free"] } });
  });

  it("treats a filter with neither field as everyone", () => {
    expect(parseAudienceFilter(base)).toEqual({ ok: true, filter: { ...base, statuses: [] } });
  });

  it("still opens an old encoded link and re-encodes in the new shape", () => {
    const legacy = { ...base, who: "unpaid" };
    const bytes = new TextEncoder().encode(JSON.stringify(legacy));
    const old = btoa(String.fromCharCode.apply(null, Array.from(bytes))).split("+").join("-").split("/").join("_").replace(/=+$/, "");
    const r = decodeAudienceFilter(old);
    expect(r).toEqual({ ok: true, filter: { ...base, statuses: ["reserved", "pending", "part_paid", "free"] } });
    if (!r.ok) throw new Error("unreachable");
    const again = encodeAudienceFilter(r.filter);
    const json = new TextDecoder().decode(Uint8Array.from(atob(again.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (again.length % 4)) % 4)), (c) => c.charCodeAt(0)));
    expect(json).not.toContain("who");
    expect(decodeAudienceFilter(again)).toEqual(r);
  });

  it("describes statuses in the fixed order in plain words", () => {
    const d = (statuses: AudienceFilter["statuses"]) => describeAudienceFilter({ ...DEFAULT_AUDIENCE_FILTER, statuses });
    expect(d([])).toEqual(["Everyone who registered or bought"]);
    expect(d(["paid"])).toEqual(["Paid"]);
    expect(d(["reserved", "paid"])).toEqual(["Paid and Reserved"]);
    expect(d(["pending", "reserved", "paid"])).toEqual(["Paid, Reserved and Pending"]);
    expect(d(["free", "part_paid"])).toEqual(["Part-paid and Free"]);
  });
});
