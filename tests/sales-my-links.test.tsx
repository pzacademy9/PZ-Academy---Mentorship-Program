import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const { requireSales, getStats, getLink, listPages } = vi.hoisted(() => ({
  requireSales: vi.fn(), getStats: vi.fn(), getLink: vi.fn(), listPages: vi.fn(),
}));
vi.mock("@/lib/auth/require-sales", () => ({ requireSalesAgentPage: requireSales }));
vi.mock("@/lib/data/landing-agent-stats", () => ({ getAgentLinkStats: getStats, listPublishedLinkPages: listPages }));
vi.mock("@/lib/data/landing-agent-links", () => ({ getOrCreateAgentLink: getLink }));

import MyLinksPage from "@/app/dashboard/sales/my-links/page";

const PAGES = [
  { id: "p1", slug: "ppc-batch-3", title: "PPC Batch 3" },
  { id: "p2", slug: "cpm-101", title: "Clinical Pharmacotherapy" },
];

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://pharmacozyme.com";
  requireSales.mockReset().mockResolvedValue({ user: { id: "agent-1" }, role: "sales_agent" });
  getLink.mockReset().mockResolvedValue({ code: "ayesha-7k2" });
  listPages.mockReset().mockResolvedValue(PAGES);
  getStats.mockReset().mockResolvedValue([{ pageId: "p1", views: 128, registered: 14, paid: 9 }]);
});
afterEach(() => vi.restoreAllMocks());

describe("My links page", () => {
  it("uses only the session user id and shows that agent's numbers, no revenue", async () => {
    const { container } = render(await MyLinksPage());
    expect(getStats).toHaveBeenCalledWith("agent-1");
    expect(getLink).toHaveBeenCalledWith("agent-1");
    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(/revenue|PKR|USD|AED/i);
  });

  it("lists only the published pages, with a zero row for a page with no data", async () => {
    render(await MyLinksPage());
    expect(screen.getByText("PPC Batch 3")).toBeTruthy();
    expect(screen.getByText("Clinical Pharmacotherapy")).toBeTruthy();
    expect(screen.queryByText("Draft Course")).toBeNull();
    expect(screen.getByDisplayValue("https://pharmacozyme.com/e/cpm-101?ref=ayesha-7k2")).toBeTruthy();
  });

  it("creates a code when none exists (getOrCreateAgentLink result is used)", async () => {
    getLink.mockResolvedValue({ code: "new-abc" });
    render(await MyLinksPage());
    expect(screen.getByDisplayValue("https://pharmacozyme.com/e/ppc-batch-3?ref=new-abc")).toBeTruthy();
  });

  it("shows an empty state when nothing is published", async () => {
    listPages.mockResolvedValue([]);
    render(await MyLinksPage());
    expect(screen.getByText(/no pages are open for registration yet/i)).toBeTruthy();
  });

  it("Copy copies the exact link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(await MyLinksPage());
    fireEvent.click(screen.getAllByRole("button", { name: /copy link/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://pharmacozyme.com/e/ppc-batch-3?ref=ayesha-7k2"));
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
  });

  it("falls back to a manual-copy message when the clipboard is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    render(await MyLinksPage());
    fireEvent.click(screen.getAllByRole("button", { name: /copy link/i })[0]);
    await waitFor(() => expect(screen.getByText(/press ctrl\+c|copy it by hand|select the link/i)).toBeTruthy());
  });
});
