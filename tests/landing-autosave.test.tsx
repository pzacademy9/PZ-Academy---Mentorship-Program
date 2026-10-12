import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { fitWithin } from "@/lib/landing/image-size";
import { emptyContent } from "@/lib/landing/content";

describe("fitWithin", () => {
  it("scales the long side down to max, keeping aspect ratio", () => {
    expect(fitWithin(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(2000, 4000, 1600)).toEqual({ width: 800, height: 1600 });
  });
  it("never upscales", () => expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 }));
});

const c = emptyContent("course");
let fetchMock: ReturnType<typeof vi.fn>;
const ok = (revision: number) => Promise.resolve({ ok: true, status: 200, json: async () => ({ revision }) });

beforeEach(() => { vi.useFakeTimers(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useAutosaveDraft", () => {
  it("debounces: many schedules produce one PATCH with the latest content and base revision", async () => {
    fetchMock.mockImplementation(() => ok(2));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 500 }));
    act(() => { result.current.schedule(c); result.current.schedule({ ...c, seo: { ...c.seo, title: "A" } }); result.current.schedule({ ...c, seo: { ...c.seo, title: "AB" } }); });
    expect(result.current.state).toBe("dirty");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.baseRevision).toBe(1);
    expect(body.content.seo.title).toBe("AB");
    expect(result.current.state).toBe("saved");
  });
  it("uses the returned revision as the next base", async () => {
    fetchMock.mockImplementationOnce(() => ok(2)).mockImplementationOnce(() => ok(3));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "B" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(2);
  });
  it("never sends two requests at once; an edit made while saving is sent after", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ revision: 2 }) }); }));
    fetchMock.mockImplementationOnce(() => ok(3));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("saving");
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "late" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(2);
  });
  it("a save that finishes while newer content is pending does not report saved until the follow-up completes", async () => {
    let release1!: () => void;
    let release2!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { release1 = () => r({ ok: true, status: 200, json: async () => ({ revision: 2 }) }); }));
    fetchMock.mockImplementationOnce(() => new Promise((r) => { release2 = () => r({ ok: true, status: 200, json: async () => ({ revision: 3 }) }); }));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "newer" } }));
    await act(async () => { release1(); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).not.toBe("saved");
    await act(async () => { release2(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.state).toBe("saved");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).content.seo.title).toBe("newer");
  });
  it("reports a conflict on 409 and stops retrying", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "conflict" }) }));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("conflict");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reports error on a network failure and keeps the content to retry via saveNow", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline"))).mockImplementationOnce(() => ok(2));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("error");
    let saved = false;
    await act(async () => { saved = await result.current.saveNow(); });
    expect(saved).toBe(true);
    expect(result.current.state).toBe("saved");
  });
  it("saveNow with nothing pending resolves true without a request", async () => {
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1 }));
    let saved = false;
    await act(async () => { saved = await result.current.saveNow(); });
    expect(saved).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useAutosaveDraft onRevision", () => {
  it("reports the new revision after each successful save", async () => {
    fetchMock.mockImplementationOnce(() => ok(2)).mockImplementationOnce(() => ok(3));
    const seen: number[] = [];
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100, onRevision: (r) => seen.push(r) }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "B" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(seen).toEqual([2, 3]);
  });
});
