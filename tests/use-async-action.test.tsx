import { renderHook, act } from "@testing-library/react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { describe, it, expect, vi } from "vitest";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("ignores a second run while the first is pending", async () => {
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const { result } = renderHook(() => useAsyncAction(fn));
    let p1!: Promise<string | undefined>;
    let p2!: Promise<string | undefined>;
    act(() => { p1 = result.current.run(); p2 = result.current.run(); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await act(async () => { d.resolve("ok"); await p1; });
    await expect(p1).resolves.toBe("ok");
    await expect(p2).resolves.toBeUndefined();
    expect(result.current.pending).toBe(false);
  });

  it("releases the lock after a rejection and rethrows", async () => {
    const fn = vi.fn(async (): Promise<string> => "second").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("second");
    const { result } = renderHook(() => useAsyncAction(fn));
    await act(async () => { await expect(result.current.run()).rejects.toThrow("boom"); });
    expect(result.current.pending).toBe(false);
    let second: string | undefined;
    await act(async () => { second = await result.current.run(); });
    expect(second).toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exposes pendingKey from getKey while running", async () => {
    const d = deferred<void>();
    const { result } = renderHook(() =>
      useAsyncAction((id: string) => d.promise, { getKey: (id) => id }),
    );
    let p!: Promise<void | undefined>;
    act(() => { p = result.current.run("row-7"); });
    expect(result.current.pendingKey).toBe("row-7");
    await act(async () => { d.resolve(); await p; });
    expect(result.current.pendingKey).toBeNull();
  });

  it("uses the latest fn without re-creating run", async () => {
    const { result, rerender } = renderHook(({ v }) => useAsyncAction(async () => v), {
      initialProps: { v: 1 },
    });
    const firstRun = result.current.run;
    rerender({ v: 2 });
    expect(result.current.run).toBe(firstRun);
    let out: number | undefined;
    await act(async () => { out = await result.current.run(); });
    expect(out).toBe(2);
  });

  it("releases the lock if getKey throws, allowing a retry", async () => {
    const fn = vi.fn(async (id: string): Promise<string> => "ok");
    const getKey = vi.fn((id: string) => {
      if (id === "throw") throw new Error("key error");
      return id;
    });
    const { result } = renderHook(() => useAsyncAction(fn, { getKey }));
    // First call with throwing getKey
    await act(async () => {
      await expect(result.current.run("throw")).rejects.toThrow("key error");
    });
    expect(result.current.pending).toBe(false);
    // Second call should succeed (lock was released)
    let out: string | undefined;
    await act(async () => { out = await result.current.run("ok"); });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
