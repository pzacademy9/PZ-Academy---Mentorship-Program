import { describe, it, expect } from "vitest";
import { emptyHistory, record, undo, redo, canUndo, canRedo } from "@/lib/landing/history";

describe("history", () => {
  it("undo returns the previous value and makes redo possible", () => {
    const h = record(emptyHistory<string>(), "a", 10_000);
    const u = undo(h, "b")!;
    expect(u.value).toBe("a");
    expect(canUndo(u.history)).toBe(false);
    expect(canRedo(u.history)).toBe(true);
  });
  it("redo reapplies it", () => {
    const h = record(emptyHistory<string>(), "a", 10_000);
    const u = undo(h, "b")!;
    const r = redo(u.history, u.value)!;
    expect(r.value).toBe("b");
    expect(canUndo(r.history)).toBe(true);
    expect(canRedo(r.history)).toBe(false);
  });
  it("a new edit after undo clears redo", () => {
    const u = undo(record(emptyHistory<string>(), "a", 10_000), "b")!;
    const h = record(u.history, "a", 20_000);
    expect(canRedo(h)).toBe(false);
  });
  it("edits within 1000ms are one undo step", () => {
    let h = record(emptyHistory<string>(), "v0", 10_000);
    h = record(h, "v1", 10_300);
    h = record(h, "v2", 10_900);
    expect(h.past).toEqual(["v0"]);
    expect(undo(h, "v3")!.value).toBe("v0");
  });
  it("an edit after the window is a new step", () => {
    let h = record(emptyHistory<string>(), "v0", 10_000);
    h = record(h, "v1", 12_000);
    expect(h.past).toEqual(["v0", "v1"]);
  });
  it("history is capped at 100", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 150; i++) h = record(h, i, 10_000 + i * 5_000);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]).toBe(50);
  });
  it("undo on empty history returns null", () => {
    expect(undo(emptyHistory<string>(), "x")).toBeNull();
    expect(redo(emptyHistory<string>(), "x")).toBeNull();
  });
});
