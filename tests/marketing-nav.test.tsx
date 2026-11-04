import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach } from "vitest";

const h = vi.hoisted(() => ({ user: null as { id: string } | null, path: "/courses" }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "student" } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.path }));

import { MarketingNav } from "@/components/marketing/MarketingNav";

const menuButton = () => screen.getByRole("button", { name: /menu/i });
const overlay = () => document.getElementById("marketing-mobile-menu") as HTMLElement & { inert?: boolean };

beforeEach(() => { h.user = null; h.path = "/courses"; });

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

  it("the open menu is never clipped by a blurred bar", () => {
    const { container } = render(<MarketingNav />);
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

  it("phone menu has Find my ID", () => {
    render(<MarketingNav />);
    fireEvent.click(menuButton());
    expect(within(overlay()).getByRole("link", { name: "Find my ID" }).getAttribute("href")).toBe("/progress");
  });
});

describe("MarketingNav top bar (Stitch Platform 2)", () => {
  const bar = () => screen.getByRole("navigation", { name: "Main" });

  it("is a light bar, so it reads on every page", () => {
    render(<MarketingNav />);
    expect(bar().className).toMatch(/bg-pz-web-surface/);
    expect(bar().className).not.toMatch(/rgba\(10,28,17/);
  });

  it("shows Find my ID next to the main button", () => {
    render(<MarketingNav />);
    const links = within(bar()).getAllByRole("link", { name: "Find my ID" });
    expect(links.some((a) => a.getAttribute("href") === "/progress")).toBe(true);
  });

  it("marks the page the visitor is on", () => {
    h.path = "/workshops";
    render(<MarketingNav />);
    const current = within(bar()).getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.getAttribute("href"))).toContain("/workshops");
    expect(current.map((a) => a.getAttribute("href"))).not.toContain("/courses");
  });

  it("a course page marks Courses as current", () => {
    h.path = "/courses/fake-course";
    render(<MarketingNav />);
    expect(within(bar()).getAllByRole("link", { current: "page" }).map((a) => a.getAttribute("href"))).toContain("/courses");
  });

  it("signed out: Start Learning goes to sign in", () => {
    render(<MarketingNav />);
    expect(within(bar()).getAllByRole("link", { name: "Start Learning" })[0].getAttribute("href")).toBe("/login");
  });

  it("signed in: the button says Go to Portal", async () => {
    h.user = { id: "u1" };
    render(<MarketingNav />);
    const link = (await within(bar()).findAllByRole("link", { name: "Go to Portal" }))[0];
    expect(link.getAttribute("href")).toBe("/dashboard");
  });
});
