import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { shouldShowTour } from "@/lib/crm/tour";
import { WelcomeTour } from "@/components/sales/WelcomeTour";

vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabase: () => ({ auth: { updateUser: vi.fn(async () => ({ error: null })) } }) }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

describe("shouldShowTour", () => {
  it("shows once for sales agents only, unless forced", () => {
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: false, localSeen: false, forced: false })).toBe(true);
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: true, localSeen: false, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: false, localSeen: true, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "admin", metadataSeen: false, localSeen: false, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "admin", metadataSeen: true, localSeen: true, forced: true })).toBe(true);
  });
});

describe("WelcomeTour", () => {
  beforeEach(() => { try { localStorage.clear(); } catch {} window.history.replaceState(null, "", "/dashboard/sales"); });

  it("walks through four steps and marks the tour seen at the end", async () => {
    const markSeen = vi.fn(async () => {});
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next: Send a message" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Tap what happened" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: We bring them back" }));
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("cannot grow wider than the dialog on a phone (min-w-0 grid track, chip row scrolls on its own)", async () => {
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={vi.fn(async () => {})} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dialog.className).toContain("overflow-x-hidden");
    for (const child of Array.from(dialog.children).filter((c) => c.tagName === "DIV")) {
      expect(child.className, child.outerHTML.slice(0, 60)).toContain("min-w-0");
    }
    const chips = screen.getByRole("tablist", { name: "Tour steps" });
    expect(chips.className).toContain("overflow-x-auto");
    expect(chips.className).toContain("min-w-0");
  });

  it("Skip tour also marks it seen", async () => {
    const markSeen = vi.fn(async () => {});
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));
  });

  it("Escape skips the tour and marks it seen", async () => {
    const markSeen = vi.fn(async () => {});
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("is a labelled modal dialog and a failing save never breaks closing", async () => {
    const markSeen = vi.fn(async () => { throw new Error("offline"); });
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not show again once seen, but ?tour=1 replays it", async () => {
    const { unmount } = render(<WelcomeTour role="sales_agent" metadataSeen={true} markSeen={vi.fn(async () => {})} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    window.history.replaceState(null, "", "/dashboard/sales?tour=1");
    render(<WelcomeTour role="sales_agent" metadataSeen={true} markSeen={vi.fn(async () => {})} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("?tour=1 replays on client-side navigation while the component stays mounted", async () => {
    const props = { role: "sales_agent" as const, metadataSeen: true, markSeen: vi.fn(async () => {}) };
    const { rerender } = render(<WelcomeTour {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    window.history.replaceState(null, "", "/dashboard/sales?tour=1");
    rerender(<WelcomeTour {...props} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
    rerender(<WelcomeTour {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an unseen agent who skips ?tour=1 does not see it reopen while the save is pending", async () => {
    window.history.replaceState(null, "", "/dashboard/sales?tour=1");
    const markSeen = vi.fn(() => new Promise<void>(() => {}));
    const props = { role: "sales_agent" as const, metadataSeen: false, markSeen };
    const { rerender } = render(<WelcomeTour {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(<WelcomeTour {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
