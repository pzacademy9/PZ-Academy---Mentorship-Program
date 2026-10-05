import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (id: string, label: string, b = budget()): AgentBudgetJson => ({ number: { id, label, phone_e164: null }, budget: b });

function mockFetch(budgets: AgentBudgetJson[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/sales/budget")) return { ok: true, json: async () => ({ budgets }) };
    if (url.includes("/freeze")) return { ok: true, json: async () => ({ ok: true, changed: true, frozenUntil: "2026-10-07T10:00:00.000Z" }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderBar = () =>
  render(
    <ConfirmProvider>
      <SalesBudgetProvider>
        <BudgetBar />
      </SalesBudgetProvider>
    </ConfirmProvider>,
  );

describe("BudgetBar", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("shows the visible budget for the preselected number (most left)", async () => {
    mockFetch([num("a", "Shared 1", budget({ dailyUsed: 50 })), num("b", "My phone", budget({ dailyUsed: 12 }))]);
    renderBar();
    expect(await screen.findByText("12 of 60 new chats used today")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /send from/i })).toBeTruthy();
  });

  it("explains when the agent has no number", async () => {
    mockFetch([]);
    renderBar();
    expect(await screen.findByText(/no whatsapp number yet/i)).toBeTruthy();
  });

  it("the panic button names the selected number and freezes only that one", async () => {
    const fetchMock = mockFetch([num("a", "Shared 1", budget({ dailyUsed: 50 })), num("b", "My phone")]);
    renderBar();
    fireEvent.click(await screen.findByRole("button", { name: /my whatsapp warns or restricts me/i }));
    expect(await screen.findByText("Pause My phone?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause this number" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/sales/numbers/b/freeze", expect.objectContaining({ method: "POST" })),
    );
  });

  it("shows an error with a retry (not a skeleton) when the first load fails", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    renderBar();
    expect(await screen.findByText("Could not load your sending budget.")).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
  });

  it("hides the panic button when the selected number is already paused", async () => {
    mockFetch([num("a", "My phone", budget({ frozen: true, frozenUntil: "2026-10-07T10:00:00.000Z" }))]);
    renderBar();
    expect(await screen.findByText(/paused until/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /my whatsapp warns or restricts me/i })).toBeNull();
  });
});
