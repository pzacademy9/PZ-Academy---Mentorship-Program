import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { TodayQueue } from "@/components/sales/TodayQueue";
import type { QueueCardJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const card = (id: string, full_name: string, over: Partial<QueueCardJson> = {}): QueueCardJson => ({
  id, full_name, phone_e164: "+923001234567", last_outcome: null, next_followup_at: null,
  last_note: null, warm: false, recently_contacted: false, ...over,
});

const budgetValue: SalesBudgetValue = {
  budgets: [], loadError: false, selectedId: null, selected: null,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
};

function mockApi(items: QueueCardJson[], remaining = items.length) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/sales/today")) return { ok: true, json: async () => ({ items, remaining }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: [] }) };
    if (url.endsWith("/outcome")) return { ok: true, json: async () => ({ ok: true, nextFollowupAt: null }) };
    return { ok: false, json: async () => ({}) };
  }));
}

const renderToday = () =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue}>
        <TodayQueue greeting="Good morning" firstName="Sara" />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );

beforeEach(() => vi.unstubAllGlobals());

describe("TodayQueue", () => {
  it("greets, counts and selects the first card", async () => {
    mockApi([card("a", "Ayesha Tariq", { warm: true }), card("b", "Bilal Khan")], 7);
    renderToday();
    expect(await screen.findByText("Good morning, Sara")).toBeTruthy();
    expect(screen.getByText("7 left today")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Ayesha Tariq" })).toBeTruthy();
    expect(screen.getByText("Replied before")).toBeTruthy();
  });

  it("logging an outcome removes the card and lowers the counter", async () => {
    mockApi([card("a", "Ayesha Tariq"), card("b", "Bilal Khan")], 2);
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: "Replied" }));
    await waitFor(() => expect(screen.getByText("1 left today")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 2, name: "Bilal Khan" })).toBeTruthy();
  });

  it("skip moves a card to the end", async () => {
    mockApi([card("a", "Ayesha Tariq"), card("b", "Bilal Khan")]);
    renderToday();
    fireEvent.click((await screen.findAllByRole("button", { name: "Skip" }))[0]);
    expect(screen.getByRole("heading", { level: 2, name: "Bilal Khan" })).toBeTruthy();
  });

  it("shows All caught up with a link to claim more when the list is empty", async () => {
    mockApi([], 0);
    renderToday();
    expect(await screen.findByRole("heading", { name: "All caught up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Claim more contacts" }).getAttribute("href")).toBe(
      "/dashboard/sales/contacts?tab=unclaimed",
    );
  });
});
