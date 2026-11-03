import { describe, expect, it } from "vitest";
import { newClock, pauseSeconds, tick } from "@/lib/landing/demo-watch";

describe("pauseSeconds", () => {
  it("maps 15, 20 and 30 and falls back to 20 for anything else", () => {
    expect(pauseSeconds("15")).toBe(15);
    expect(pauseSeconds("20")).toBe(20);
    expect(pauseSeconds("30")).toBe(30);
    for (const v of [undefined, "", "99", 15, null, "abc"]) expect(pauseSeconds(v)).toBe(20);
  });
});

describe("watch clock", () => {
  it("does not pause before the interval", () => {
    let c = newClock(20);
    for (let i = 0; i < 39; i++) {
      const r = tick(c, 0.5, true);
      expect(r.pause).toBe(false);
      c = r.clock;
    }
  });

  it("pauses exactly when the interval is reached, then starts again from zero", () => {
    let c = newClock(20);
    const pausesAt: number[] = [];
    for (let i = 1; i <= 80; i++) {
      const r = tick(c, 0.5, true);
      c = r.clock;
      if (r.pause) pausesAt.push(i * 0.5);
    }
    expect(pausesAt).toEqual([20, 40]);
  });

  it("does not count time while not playing", () => {
    let c = newClock(20);
    for (let i = 0; i < 400; i++) {
      const r = tick(c, 0.5, false);
      expect(r.pause).toBe(false);
      c = r.clock;
    }
    expect(c.watched).toBe(0);
  });

  it("a big jump in time still gives one pause, not several", () => {
    const r = tick(newClock(20), 90, true);
    expect(r.pause).toBe(true);
    expect(r.clock.watched).toBe(0);
  });
});
