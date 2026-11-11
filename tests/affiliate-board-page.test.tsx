import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ allowed: vi.fn(), isToken: vi.fn(), board: vi.fn() }));
vi.mock("@/lib/pzid/caller-allowed", () => ({ affiliatePageCallerAllowed: m.allowed }));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ isBoardToken: m.isToken, getAffiliateBoard: m.board }));

import Page, { metadata, dynamic } from "@/app/affiliate-board/[token]/page";

const token = "a".repeat(32);
const ctx = (t = token) => ({ params: Promise.resolve({ token: t }) });

// Rows carry fields the public page must never show: id, full name, email, code.
const row = (over: Record<string, unknown>) => ({
  affiliateId: "id-1", name: "Ali Khan", email: "ali@example.com", code: "ALI777", team: "Blue", registered: 9, paid: 4, rank: 1, publicName: "Ali K.", ...over,
});
const teams = (paid = 0) =>
  ["Green", "White", "Yellow", "Blue", "Pink"].map((team, i) => ({ team, rank: i + 1, paid, members: 1, active: paid ? 1 : 0, score: paid }));
const sara = { affiliateId: "id-2", name: "Sara Noor", publicName: "Sara N.", team: "Pink", rank: 2 };
const boardFor = (period: string) =>
  period === "month"
    ? { period, rows: [row({ paid: 2, rank: 1 }), row({ ...sara, paid: 1 })], teams: teams(2) }
    : { period, rows: [row({ paid: 7, rank: 1 }), row({ ...sara, paid: 5 })], teams: teams(7) };

beforeEach(() => {
  m.allowed.mockReset().mockResolvedValue(true);
  m.isToken.mockReset().mockResolvedValue(true);
  m.board.mockReset().mockImplementation(async (p: string) => boardFor(p));
});

describe("the public affiliate board route", () => {
  it("is never indexed and never cached", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
  it("a wrong or malformed token shows the neutral page and never reads a board", async () => {
    m.isToken.mockResolvedValue(false);
    render(await Page(ctx("zzz")));
    expect(screen.getByRole("heading", { name: "This page is no longer active." })).toBeTruthy();
    expect(m.board).not.toHaveBeenCalled();
  });
  it("a caller over the limit gets the same page and nothing else is read", async () => {
    m.allowed.mockResolvedValue(false);
    render(await Page(ctx()));
    expect(screen.getByRole("heading", { name: "This page is no longer active." })).toBeTruthy();
    expect(m.isToken).not.toHaveBeenCalled();
    expect(m.board).not.toHaveBeenCalled();
  });
  it("a read error is not hidden", async () => {
    m.isToken.mockRejectedValue(new Error("db down"));
    await expect(Page(ctx())).rejects.toThrow("db down");
  });
  it("shows This month first, and switching shows all-time numbers", async () => {
    render(await Page(ctx()));
    expect(screen.getByRole("button", { name: "This month" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("Ali K.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 paid").length).toBeGreaterThan(0);
    expect(screen.queryByText("7 paid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(screen.getAllByText("7 paid").length).toBeGreaterThan(0);
    expect(screen.queryByText("2 paid")).toBeNull();
  });
  it("never lets a full name, email, code or id reach the page or the client props", async () => {
    const tree = await Page(ctx());
    const props = JSON.stringify(tree);
    for (const secret of ["Khan", "@", "ALI777", "id-1", "registered", "affiliateId", "email"]) expect(props).not.toContain(secret);
    const { container } = render(tree);
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(container.innerHTML).toContain("Ali K.");
    for (const secret of ["Khan", "@", "ALI777"]) expect(container.innerHTML).not.toContain(secret);
  });
  it("shows the team race in plain words", async () => {
    render(await Page(ctx()));
    expect(screen.getByText(/paid per active member/i)).toBeTruthy();
    expect(screen.getAllByText("Blue").length).toBeGreaterThan(0);
  });
  it("an empty period shows a friendly message", async () => {
    m.board.mockImplementation(async (p: string) => ({ period: p, rows: [], teams: teams(0) }));
    render(await Page(ctx()));
    expect(screen.getByText("No paid sales yet this month. Be the first.")).toBeTruthy();
  });
  it("a one-row board renders one podium place", async () => {
    m.board.mockImplementation(async (p: string) => ({ period: p, rows: [row({ paid: 3 })], teams: teams(3) }));
    render(await Page(ctx()));
    expect(screen.getAllByRole("listitem", { name: /podium place/i }).length).toBe(1);
  });
});
