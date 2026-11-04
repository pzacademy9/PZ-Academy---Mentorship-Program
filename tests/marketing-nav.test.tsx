import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { MarketingNav } from "@/components/marketing/MarketingNav";

const menuButton = () => screen.getByRole("button", { name: /menu/i });
const overlay = () => document.getElementById("marketing-mobile-menu") as HTMLElement & { inert?: boolean };

describe("MarketingNav phone menu", () => {
  it("menu button is a 44px tap target that controls the menu", () => {
    render(<MarketingNav />);
    expect(menuButton().className).toMatch(/min-h-11/);
    expect(menuButton().className).toMatch(/min-w-11/);
    expect(menuButton().getAttribute("aria-controls")).toBe("marketing-mobile-menu");
  });

  it("closed menu cannot be reached with the keyboard or a screen reader", () => {
    render(<MarketingNav />);
    expect(overlay().getAttribute("aria-hidden")).toBe("true");
    expect(overlay().inert).toBe(true);
  });

  it("opening moves focus into the menu; Escape closes it and returns focus", () => {
    render(<MarketingNav />);
    fireEvent.click(menuButton());
    expect(overlay().getAttribute("aria-hidden")).toBeNull();
    expect(overlay().inert).toBe(false);
    expect(overlay().contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(overlay().getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(menuButton());
  });

  it("never steals focus when the page loads", () => {
    const before = document.activeElement;
    render(<MarketingNav />);
    expect(document.activeElement).toBe(before);
  });

  it("closed menu is invisible, so it is out of the tab order even before scripts run", () => {
    render(<MarketingNav />);
    expect(overlay().className).toMatch(/\binvisible\b/);
    fireEvent.click(menuButton());
    expect(overlay().className).not.toMatch(/\binvisible\b/);
  });

  it("tapping a link closes the menu without pulling focus back to the button", () => {
    render(<MarketingNav />);
    fireEvent.click(menuButton());
    const link = overlay().querySelector('a[href="/courses"]') as HTMLElement;
    link.focus();
    fireEvent.click(link);
    expect(overlay().getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).not.toBe(menuButton());
  });

  it("the open menu is never clipped by a blurred bar (alwaysSolid pages)", () => {
    const { container } = render(<MarketingNav alwaysSolid />);
    const nav = container.querySelector("nav")!;
    expect(nav.className).toMatch(/backdrop-blur-xl/);
    fireEvent.click(menuButton());
    expect(nav.className).not.toMatch(/backdrop-blur/);
  });

  it("menu lists every program", () => {
    render(<MarketingNav />);
    fireEvent.click(menuButton());
    const hrefs = Array.from(overlay().querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const h of ["/", "/courses", "/webinars", "/workshops", "/mentorship"]) expect(hrefs).toContain(h);
  });
});
