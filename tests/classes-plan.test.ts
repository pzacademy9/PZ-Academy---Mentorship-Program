import { describe, it, expect } from "vitest";
import {
  planClasses,
  applyDefaultsToClasses,
  type ClassDefaults,
  type ExistingClass,
} from "@/lib/classes/plan";
import { pktToIso } from "@/lib/attendance/rules";

const defaults: ClassDefaults = { start: "20:00", end: "21:30", zoom: "https://zoom.us/j/1" };

const existing = (over: Partial<ExistingClass> & { id: string; number: number }): ExistingClass => ({
  startsAtIso: pktToIso("2026-11-10T20:00")!,
  endsAtIso: pktToIso("2026-11-10T21:30")!,
  zoom: defaults.zoom,
  customTime: false,
  customZoom: false,
  ...over,
});

describe("planClasses", () => {
  it("webinar rejects two days", () => {
    const r = planClasses([{ date: "2026-11-10" }, { date: "2026-11-11" }], defaults, [], "webinar");
    expect(r).toEqual({ ok: false, message: "A webinar has only one day" });
  });

  it("an existing custom class with no end time keeps it empty when the day sends no end", () => {
    const old = existing({ id: "c1", number: 1, customTime: true, endsAtIso: null, startsAtIso: pktToIso("2026-11-10T21:00")! });
    const r = planClasses([{ date: "2026-11-10", existingId: "c1", start: "21:00" }], defaults, [old], "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops[0]).toMatchObject({ kind: "update", id: "c1", endsAt: null, startsAt: pktToIso("2026-11-10T21:00"), customTime: true });
  });

  it("an existing custom class with no end time and a late start does not fail on the default end", () => {
    const old = existing({ id: "c1", number: 1, customTime: true, endsAtIso: null, startsAtIso: pktToIso("2026-11-10T22:00")! });
    const r = planClasses([{ date: "2026-11-10", existingId: "c1", start: "22:00" }], defaults, [old], "course");
    expect(r.ok).toBe(true);
  });

  it("an end time typed for a class that had none is used", () => {
    const old = existing({ id: "c1", number: 1, customTime: true, endsAtIso: null });
    const r = planClasses([{ date: "2026-11-10", existingId: "c1", start: "20:00", end: "22:00" }], defaults, [old], "course");
    expect(r.ok && r.ops[0]).toMatchObject({ endsAt: pktToIso("2026-11-10T22:00") });
  });

  it("course follows defaults and marks not custom", () => {
    const r = planClasses([{ date: "2026-11-10" }, { date: "2026-11-12" }], defaults, [], "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops).toHaveLength(2);
    expect(r.ops[0]).toMatchObject({
      kind: "create",
      number: 1,
      date: "2026-11-10",
      startsAt: pktToIso("2026-11-10T20:00"),
      endsAt: pktToIso("2026-11-10T21:30"),
      zoom: defaults.zoom,
      customTime: false,
      customZoom: false,
    });
    expect(r.ops[1]).toMatchObject({ kind: "create", number: 2 });
  });

  it("own time marks custom and keeps defaults for zoom", () => {
    const r = planClasses([{ date: "2026-11-10", start: "18:00", end: "19:00" }], defaults, [], "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops[0]).toMatchObject({
      startsAt: pktToIso("2026-11-10T18:00"),
      endsAt: pktToIso("2026-11-10T19:00"),
      zoom: defaults.zoom,
      customTime: true,
      customZoom: false,
    });
  });

  it("new earlier day gets next free number, existing numbers untouched", () => {
    const ex = [existing({ id: "a", number: 1 }), existing({ id: "b", number: 2 })];
    const r = planClasses(
      [
        { date: "2026-11-05" },
        { date: "2026-11-10", existingId: "a" },
        { date: "2026-11-11", existingId: "b" },
      ],
      defaults,
      ex,
      "course",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const creates = r.ops.filter((o) => o.kind === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ number: 3, date: "2026-11-05" });
    expect(r.ops.filter((o) => o.kind === "update").map((o) => (o as { id: string }).id).sort()).toEqual(["a", "b"]);
    expect(r.ops.some((o) => o.kind === "remove")).toBe(false);
  });

  it("unticked existing day becomes remove", () => {
    const ex = [existing({ id: "a", number: 1 }), existing({ id: "b", number: 2 })];
    const r = planClasses([{ date: "2026-11-10", existingId: "a" }], defaults, ex, "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops).toContainEqual({ kind: "remove", id: "b" });
  });

  it("end before start is rejected", () => {
    const r = planClasses([{ date: "2026-11-10", start: "20:00", end: "19:00" }], defaults, [], "course");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe("The end time must be after the start time on 2026-11-10");
  });

  it("duplicate day is rejected", () => {
    const r = planClasses([{ date: "2026-11-10" }, { date: "2026-11-10" }], defaults, [], "course");
    expect(r).toEqual({ ok: false, message: "The day 2026-11-10 is listed twice" });
  });
});

describe("applyDefaultsToClasses", () => {
  it("applyDefaultsToClasses skips custom rows and rows with no end time", () => {
    const newDefaults: ClassDefaults = { start: "19:00", end: "20:00", zoom: "https://zoom.us/j/2" };
    const rows = [
      existing({ id: "plain", number: 1 }),
      existing({ id: "custom", number: 2, customTime: true, customZoom: true }),
      existing({ id: "noend", number: 3, endsAtIso: null, customZoom: true }),
      existing({ id: "zoomonly", number: 4, customTime: true }),
    ];
    const out = applyDefaultsToClasses(rows, newDefaults);
    expect(out.map((o) => o.id)).toEqual(["plain", "zoomonly"]);
    expect(out[0]).toEqual({
      id: "plain",
      startsAt: pktToIso("2026-11-10T19:00"),
      endsAt: pktToIso("2026-11-10T20:00"),
      zoom: newDefaults.zoom,
    });
    expect(out[1]).toEqual({ id: "zoomonly", zoom: newDefaults.zoom });
  });
});
