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
