import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ allowed: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/pzid/caller-allowed", () => ({ affiliatePageCallerAllowed: m.allowed }));
vi.mock("@/lib/data/affiliate-page", () => ({ getAffiliatePageModel: m.model }));

import Page, { metadata, dynamic } from "@/app/affiliate/[token]/page";

const token = "a".repeat(32);
const ctx = (t = token) => ({ params: Promise.resolve({ token: t }) });
const good = {
  name: "Sara Khan", code: "SK321", team: "Blue", percent: 8, paidCount: 3, toNextStep: 7, earnedPkr: 800, balancePkr: 800, waiting: [],
  totals: { views: 1, registered: 1, paid: 1 }, links: [], supportWa: "https://wa.me/923155614490",
  rank: { all: null, month: null, boardUrl: "" },
};

beforeEach(() => {
  m.allowed.mockReset().mockResolvedValue(true);
  m.model.mockReset().mockResolvedValue(good);
});

describe("the private affiliate page route", () => {
  it("is never indexed and never cached", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
  it("shows the page for a good token", async () => {
    render(await Page(ctx()));
    expect(screen.getByText("Hello, Sara Khan")).toBeTruthy();
    expect(m.model).toHaveBeenCalledWith(token);
  });
  it("an unknown, dropped or malformed token gets the same neutral page with nothing about why", async () => {
    m.model.mockResolvedValue(null);
    const { container } = render(await Page(ctx("zzz")));
    expect(screen.getByRole("heading", { name: "This page is no longer active." })).toBeTruthy();
    expect(container.textContent).not.toMatch(/token|dropped|left|not found|invalid|rate/i);
  });
  it("a caller over the limit gets the same neutral page and no data is read", async () => {
    m.allowed.mockResolvedValue(false);
    render(await Page(ctx()));
    expect(screen.getByRole("heading", { name: "This page is no longer active." })).toBeTruthy();
    expect(m.model).not.toHaveBeenCalled();
  });
  it("checks the limit before reading anything", async () => {
    const order: string[] = [];
    m.allowed.mockImplementation(async () => (order.push("limit"), true));
    m.model.mockImplementation(async () => (order.push("read"), good));
    await Page(ctx());
    expect(order).toEqual(["limit", "read"]);
  });
  it("a read error is not hidden as 'no longer active'", async () => {
    m.model.mockRejectedValue(new Error("db down"));
    await expect(Page(ctx())).rejects.toThrow("db down");
  });
});
