import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { requireSales, listRegistrations, listPageOptions, getDetail } = vi.hoisted(() => ({
  requireSales: vi.fn(),
  listRegistrations: vi.fn(),
  listPageOptions: vi.fn(),
  getDetail: vi.fn(),
}));
vi.mock("@/lib/auth/require-sales", () => ({ requireSalesAgentPage: requireSales }));
vi.mock("@/lib/data/landing-registration-admin", () => ({
  listRegistrations,
  listRegistrationPageOptions: listPageOptions,
  getRegistrationDetail: getDetail,
}));

import SalesRegistrationsPage from "@/app/dashboard/sales/registrations/page";
import SalesRegistrationDetailPage from "@/app/dashboard/sales/registrations/[id]/page";

const emptyList = {
  rows: [], total: 0, pageSize: 25,
  counts: { all: 0, pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 },
};
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => {
  requireSales.mockReset();
  listRegistrations.mockReset().mockResolvedValue(emptyList);
  listPageOptions.mockReset().mockResolvedValue([]);
  getDetail.mockReset();
});

describe("sales registrations list page", () => {
  it("agent page queries with agent scope", async () => {
    requireSales.mockResolvedValue({ user: { id: "agent-1" }, role: "sales_agent" });
    render(await SalesRegistrationsPage({ searchParams: sp({ status: "paid", agentId: "someone-else" }) }));
    expect(listRegistrations).toHaveBeenCalledTimes(1);
    expect(listRegistrations.mock.calls[0][0]).toEqual({ kind: "agent", agentId: "agent-1" });
    // a pasted agentId in the URL is not an agent filter for agents
    expect(listRegistrations.mock.calls[0][1].agentId).toBeUndefined();
    expect(screen.queryByLabelText(/agent/i)).toBeNull();
  });

  it("agent page with an empty user id shows nothing", async () => {
    requireSales.mockResolvedValue({ user: { id: "" }, role: "sales_agent" });
    render(await SalesRegistrationsPage({ searchParams: sp() }));
    expect(listRegistrations.mock.calls[0][0]).toEqual({ kind: "agent", agentId: "" });
    expect(screen.getByText(/no registrations yet/i)).toBeTruthy();
  });

  it("an admin reaching the sales path sees everything", async () => {
    requireSales.mockResolvedValue({ user: { id: "admin-1" }, role: "admin" });
    render(await SalesRegistrationsPage({ searchParams: sp() }));
    expect(listRegistrations.mock.calls[0][0]).toEqual({ kind: "all" });
  });
});

describe("sales registration detail page", () => {
  it("agent detail for someone else's registration is notFound", async () => {
    requireSales.mockResolvedValue({ user: { id: "agent-1" }, role: "sales_agent" });
    getDetail.mockResolvedValue(null);
    await expect(SalesRegistrationDetailPage({ params: Promise.resolve({ id: "r9" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getDetail).toHaveBeenCalledWith("r9", { kind: "agent", agentId: "agent-1" });
  });
});
