import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

describe("MarketingFooter", () => {
  it("has no links that go nowhere", () => {
    const { container } = render(<MarketingFooter />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h === "#" || h === "" || h === null || /^javascript:/i.test(h ?? "")).toBe(false);
  });

  it("every link is a big enough tap target", () => {
    const { container } = render(<MarketingFooter />);
    for (const a of Array.from(container.querySelectorAll("a"))) expect(a.className).toMatch(/min-h-11/);
  });

  it("links every program and keeps the WhatsApp contact", () => {
    render(<MarketingFooter />);
    for (const [name, href] of [["Courses", "/courses"], ["Webinars", "/webinars"], ["Workshops", "/workshops"], ["Mentorship", "/mentorship"]]) {
      expect(screen.getAllByRole("link", { name }).some((a) => a.getAttribute("href") === href)).toBe(true);
    }
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
  });

  it("does not use the old near-invisible white text (.2x/.3x)", () => {
    const { container } = render(<MarketingFooter />);
    expect(container.innerHTML).not.toMatch(/rgba\(255,255,255,\.(2|3)\d?\)/);
  });

  it("has the Help links from the design that lead somewhere real", () => {
    render(<MarketingFooter />);
    expect(screen.getByRole("link", { name: "Find my ID" }).getAttribute("href")).toBe("/progress");
    expect(screen.getByRole("link", { name: /certificate/i }).getAttribute("href")).toMatch(/^https:\/\/cert\.pharmacozyme\.com/);
  });

  it("is the deep green band from the design, with a plain copyright line", () => {
    const { container } = render(<MarketingFooter />);
    expect(container.querySelector("footer")!.className).toMatch(/bg-pz-solid-deep/);
    expect(container.textContent).toMatch(/PZ Academy by Pharmacozyme\. All rights reserved\./);
  });

  it("never copies made-up design text", () => {
    const { container } = render(<MarketingFooter />);
    expect(container.textContent).not.toMatch(/Karachi|Dubai|Riyadh|Academic Calendar|Fellowship|Terms of Service|Privacy Policy/);
  });
});
