import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CheckinPanel } from "@/components/attendance/CheckinPanel";

const START = Date.parse("2026-11-21T10:00:00.000Z");
const MIN = 60 * 1000;

function mount(nowMs: number, override: "auto" | "open" | "closed" = "auto") {
  return render(
    <CheckinPanel
      code="abc"
      personal={vi.fn()}
      shared={vi.fn()}
      startsAtIso={new Date(START).toISOString()}
      override={override}
      open={15}
      close={30}
      serverNowIso={new Date(nowMs).toISOString()}
    />,
  );
}
const button = () => screen.getByRole("button", { name: "Mark me present" }) as HTMLButtonElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CheckinPanel timer", () => {
  it("shows a countdown to opening and keeps the button disabled", () => {
    vi.setSystemTime(START - 30 * MIN);
    mount(START - 30 * MIN);
    expect(screen.getByText("Check-in opens in")).toBeTruthy();
    expect(screen.getByTestId("checkin-timer").textContent).toContain("15:00");
    expect(button().disabled).toBe(true);
  });

  it("flips to open without remounting and keeps the typed email", () => {
    vi.setSystemTime(START - 15 * MIN - 2000);
    mount(START - 15 * MIN - 2000);
    fireEvent.change(screen.getByLabelText("Your registered email"), { target: { value: "a@b.co" } });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Check-in closes in")).toBeTruthy();
    expect(button().disabled).toBe(false);
    expect((screen.getByLabelText("Your registered email") as HTMLInputElement).value).toBe("a@b.co");
  });

  it("turns the digits red in the last 60 seconds before closing", () => {
    vi.setSystemTime(START + 30 * MIN - 90 * 1000);
    mount(START + 30 * MIN - 90 * 1000);
    const digits = () => screen.getByTestId("checkin-timer-digits");
    expect(digits().className).not.toContain("text-red-700");
    act(() => { vi.advanceTimersByTime(40 * 1000); });
    expect(digits().className).toContain("text-red-700");
  });

  it("shows only the closed text after close", () => {
    vi.setSystemTime(START + 31 * MIN);
    mount(START + 31 * MIN);
    expect(screen.getByTestId("checkin-timer").textContent).toContain("Check-in has closed.");
    expect(screen.queryByTestId("checkin-timer-digits")).toBeNull();
    expect(button().disabled).toBe(true);
  });

  it("shows no timer for a forced override", () => {
    vi.setSystemTime(START);
    const { unmount } = mount(START, "open");
    expect(screen.queryByTestId("checkin-timer")).toBeNull();
    expect(button().disabled).toBe(false);
    unmount();
    mount(START, "closed");
    expect(screen.queryByTestId("checkin-timer")).toBeNull();
    expect(button().disabled).toBe(true);
  });

  it("follows the server time when the phone clock is 10 minutes wrong", () => {
    vi.setSystemTime(START - 30 * MIN + 10 * MIN);
    mount(START - 30 * MIN);
    expect(screen.getByTestId("checkin-timer").textContent).toContain("15:00");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("checkin-timer").textContent).toContain("14:55");
  });

  it("changes the live line only about once a minute and on a state flip", () => {
    vi.setSystemTime(START - 15 * MIN - 10 * MIN);
    mount(START - 15 * MIN - 10 * MIN);
    const live = () => screen.getByTestId("checkin-timer-live").textContent;
    const first = live();
    expect(first).toBe("Check-in opens in 10 minutes");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(live()).toBe(first);
    act(() => { vi.advanceTimersByTime(10 * MIN + 1000); });
    expect(live()).toBe("Check-in is open. It closes in 45 minutes.");
  });
});
