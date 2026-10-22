import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const { requireAdmin, getBoard } = vi.hoisted(() => ({ requireAdmin: vi.fn(), getBoard: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: requireAdmin }));
vi.mock("@/lib/data/landing-agent-stats", () => ({ getLeaderboard: getBoard }));

import LeaderboardPage from "@/app/dashboard/admin/agent-leaderboard/page";

const ROWS = [
  { agentId: "a1", name: "Sarah Jenkins", registered: 84, paid: 58, revenue: [{ currency: "PKR", amount: 890000 }, { currency: "AED", amount: 7200 }] },
  { agentId: "a2", name: "Zainab Bilal", registered: 12, paid: 0, revenue: [] },
];
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin" } });
  getBoard.mockReset().mockResolvedValue(ROWS);
});

describe("agent leaderboard page", () => {
  it("renders one revenue line per currency", async () => {
    render(await LeaderboardPage({ searchParams: sp() }));
    expect(screen.getAllByText("PKR 890,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AED 7,200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sarah Jenkins").length).toBeGreaterThan(0);
  });

  it("treats a bad range as all time, and passes valid ones through", async () => {
    render(await LeaderboardPage({ searchParams: sp({ range: "bogus" }) }));
    expect(getBoard).toHaveBeenLastCalledWith("all");
    await LeaderboardPage({ searchParams: sp({ range: "7d" }) });
    expect(getBoard).toHaveBeenLastCalledWith("7d");
    await LeaderboardPage({ searchParams: sp({ range: "30d" }) });
    expect(getBoard).toHaveBeenLastCalledWith("30d");
  });

  it("shows a row that registered earlier but paid in the window", async () => {
    getBoard.mockResolvedValue([{ agentId: "a3", name: "Late Payer", registered: 0, paid: 1, revenue: [{ currency: "PKR", amount: 5000 }] }]);
    render(await LeaderboardPage({ searchParams: sp({ range: "7d" }) }));
    expect(screen.queryByText(/no sales in this period/i)).toBeNull();
    expect(screen.getAllByText("Late Payer").length).toBeGreaterThan(0);
  });

  it("shows the paid rate only for all time, never above 100%", async () => {
    getBoard.mockResolvedValue([{ agentId: "a4", name: "Odd", registered: 1, paid: 3, revenue: [] }]);
    const win = render(await LeaderboardPage({ searchParams: sp({ range: "7d" }) }));
    expect(win.container.textContent).not.toMatch(/%/);
    win.unmount();
    const all = render(await LeaderboardPage({ searchParams: sp({ range: "all" }) }));
    const rates = Array.from(all.container.querySelectorAll("p, span, td"))
      .filter((e) => e.children.length === 0)
      .map((e) => e.textContent ?? "")
      .filter((t) => /^\d+%/.test(t.trim()));
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) expect(parseInt(r, 10)).toBeLessThanOrEqual(100);
  });

  it("names a blank agent Unnamed agent", async () => {
    getBoard.mockResolvedValue([{ agentId: "a5", name: "", registered: 2, paid: 1, revenue: [] }]);
    render(await LeaderboardPage({ searchParams: sp() }));
    expect(screen.getAllByText("Unnamed agent").length).toBe(2);
  });

  it("shows an empty state with no agents", async () => {
    getBoard.mockResolvedValue([]);
    render(await LeaderboardPage({ searchParams: sp() }));
    expect(screen.getByText(/no sales agents yet/i)).toBeTruthy();
  });

  it("refuses non-admins before reading anything", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(LeaderboardPage({ searchParams: sp() })).rejects.toThrow("NEXT_REDIRECT");
    expect(getBoard).not.toHaveBeenCalled();
  });
});
