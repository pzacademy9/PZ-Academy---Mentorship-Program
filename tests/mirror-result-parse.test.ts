import { describe, it, expect } from "vitest";
import { parseMirrorResult } from "@/lib/landing/mirror/result";

describe("parseMirrorResult", () => {
  it("returns null for things that are not results", () => {
    expect(parseMirrorResult(null)).toBeNull();
    expect(parseMirrorResult(undefined)).toBeNull();
    expect(parseMirrorResult("ok")).toBeNull();
    expect(parseMirrorResult([1, 2])).toBeNull();
    expect(parseMirrorResult({})).toBeNull();
    expect(parseMirrorResult({ ok: "yes" })).toBeNull();
  });

  it("fills in an older shape that has no problems or notes", () => {
    const r = parseMirrorResult({ ok: true, inserted: 2, changed: 1, ranAt: "2026-10-30T10:00:00Z" });
    expect(r).toEqual({
      ok: true, preview: false, inserted: 2, changed: 1, linked: 0, skipped: 0,
      problems: [], notes: [], ranAt: "2026-10-30T10:00:00Z",
    });
  });

  it("treats partial counts as zero and infers ok from a missing flag", () => {
    expect(parseMirrorResult({ inserted: 3 })?.ok).toBe(true);
    expect(parseMirrorResult({ inserted: 3, error: "x" })?.ok).toBe(false);
    expect(parseMirrorResult({ inserted: 3 })?.changed).toBe(0);
  });

  it("drops wrong types", () => {
    const r = parseMirrorResult({
      ok: true, inserted: "5", changed: Number.NaN, linked: Infinity, skipped: 4,
      problems: [{ rowNumber: 3, reason: "Bad" }, { rowNumber: "4", reason: "x" }, { rowNumber: 5, reason: 9 }, null, "s"],
      notes: ["keep", 7, null], error: 12, ranAt: 99,
    });
    expect(r).toEqual({
      ok: true, preview: false, inserted: 0, changed: 0, linked: 0, skipped: 4,
      problems: [{ rowNumber: 3, reason: "Bad" }], notes: ["keep"], ranAt: "",
    });
  });

  it("ignores a lastGood extra field and keeps a string error", () => {
    const r = parseMirrorResult({ ok: false, error: "Already running", ranAt: "t", lastGood: { ok: true, inserted: 9 } });
    expect(r).toEqual({
      ok: false, preview: false, inserted: 0, changed: 0, linked: 0, skipped: 0,
      problems: [], notes: [], error: "Already running", ranAt: "t",
    });
    expect(r && "lastGood" in r).toBe(false);
  });
});
