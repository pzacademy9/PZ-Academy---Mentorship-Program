import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContentHistory, historyKeyAction } from "@/hooks/useContentHistory";
import { emptyContent, type LandingContent } from "@/lib/landing/content";

const make = (title: string): LandingContent => {
  const c = emptyContent("course");
  c.seo.title = title;
  return c;
};

function key(init: Partial<KeyboardEvent> & { key: string }, target: Element | null = document.body): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { ctrlKey: true, ...init });
  Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("useContentHistory", () => {
  it("canUndo is false on a fresh editor", () => {
    const { result } = renderHook(() => useContentHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
  it("undo restores the content before the last edit", () => {
    const { result } = renderHook(() => useContentHistory());
    act(() => result.current.record(make("one")));
    expect(result.current.canUndo).toBe(true);
    let back: LandingContent | null = null;
    act(() => { back = result.current.undo(make("two")); });
    expect(back!.seo.title).toBe("one");
  });
  it("redo returns it", () => {
    const { result } = renderHook(() => useContentHistory());
    act(() => result.current.record(make("one")));
    act(() => { result.current.undo(make("two")); });
    expect(result.current.canRedo).toBe(true);
    let fwd: LandingContent | null = null;
    act(() => { fwd = result.current.redo(make("one")); });
    expect(fwd!.seo.title).toBe("two");
  });
  it("clear empties both stacks", () => {
    const { result } = renderHook(() => useContentHistory());
    act(() => result.current.record(make("one")));
    act(() => { result.current.undo(make("two")); });
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
  it("typing twice within a second is one undo", () => {
    const { result } = renderHook(() => useContentHistory());
    act(() => { result.current.record(make("a")); result.current.record(make("ab")); });
    let back: LandingContent | null = null;
    act(() => { back = result.current.undo(make("abc")); });
    expect(back!.seo.title).toBe("a");
    expect(result.current.canUndo).toBe(false);
  });
});

describe("historyKeyAction", () => {
  it("Ctrl+Z is undo, Ctrl+Shift+Z and Ctrl+Y are redo", () => {
    expect(historyKeyAction(key({ key: "z" }))).toBe("undo");
    expect(historyKeyAction(key({ key: "Z", shiftKey: true }))).toBe("redo");
    expect(historyKeyAction(key({ key: "y" }))).toBe("redo");
    expect(historyKeyAction(key({ key: "z", ctrlKey: false, metaKey: true }))).toBe("undo");
    expect(historyKeyAction(key({ key: "a" }))).toBeNull();
  });
  it("Ctrl+Z inside a text input is ignored by the editor handler", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(historyKeyAction(key({ key: "z" }, input))).toBeNull();
    expect(historyKeyAction(key({ key: "z" }, area))).toBeNull();
    expect(historyKeyAction(key({ key: "z" }, editable))).toBeNull();
  });
});
