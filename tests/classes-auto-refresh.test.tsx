import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));

import { useAutoRefresh } from "@/components/admin/classes/useAutoRefresh";

function Probe() {
  useAutoRefresh();
  return null;
}

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

beforeEach(() => {
  h.refresh.mockReset();
  setVisibility("visible");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useAutoRefresh", () => {
  it("refreshes about every 60 seconds while the page is visible", () => {
    render(<Probe />);
    vi.advanceTimersByTime(59_000);
    expect(h.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(h.refresh).toHaveBeenCalledTimes(2);
  });

  it("stops when the screen is left", () => {
    const { unmount } = render(<Probe />);
    unmount();
    vi.advanceTimersByTime(180_000);
    expect(h.refresh).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("does nothing while the tab is hidden, and refreshes once when it shows again", () => {
    render(<Probe />);
    setVisibility("hidden");
    vi.advanceTimersByTime(180_000);
    expect(h.refresh).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
