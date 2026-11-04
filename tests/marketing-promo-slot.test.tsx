import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromoSlot } from "@/components/marketing/PromoSlot";

const promo = { headline: "Fake Batch 1", detail: "New batch starts 12 Nov", ctaText: "See the batch", href: "/e/s1", imageUrl: null };

describe("PromoSlot", () => {
  it("renders nothing without a promo", () => {
    const { container } = render(<PromoSlot promo={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is honestly labelled Featured and has one big link", () => {
    render(<PromoSlot promo={promo} />);
    expect(screen.getByText("Featured")).toBeTruthy();
    const link = screen.getByRole("link", { name: /See the batch/ });
    expect(link.getAttribute("href")).toBe("/e/s1");
    expect(link.className).toMatch(/min-h-11/);
    expect(screen.getByRole("heading", { name: "Fake Batch 1" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Featured: Fake Batch 1" })).toBeTruthy();
  });

  it("opens an outside link in a new tab safely", () => {
    render(<PromoSlot promo={{ ...promo, href: "https://example.com/x" }} />);
    const link = screen.getByRole("link", { name: /See the batch/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("card look keeps the label and link", () => {
    render(<PromoSlot promo={promo} variant="card" />);
    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.getByRole("link", { name: /See the batch/ })).toBeTruthy();
  });
});
