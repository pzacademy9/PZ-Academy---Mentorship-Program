import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { SendPanel } from "@/components/sales/SendPanel";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (b = budget()): AgentBudgetJson => ({ number: { id: "n1", label: "My phone", phone_e164: null }, budget: b });
const contact = { id: "c1", full_name: "Ayesha Tariq", phone_e164: "+923001234567", warm: false, recently_contacted: false };

function setup(budgets: AgentBudgetJson[] | null, extra: Partial<SalesBudgetValue> = {}) {
  const value: SalesBudgetValue = {
    budgets,
    loadError: false,
    selectedId: budgets?.[0]?.number.id ?? null,
    selected: budgets?.[0] ?? null,
    select: vi.fn(),
    refresh: vi.fn(async () => {}),
    applyBudget: vi.fn(),
    ...extra,
  };
  const onOutcome = vi.fn();
  const openLink = vi.fn();
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={value}>
        <SendPanel contact={contact} templates={[]} onOutcome={onOutcome} openLink={openLink} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { onOutcome, openLink, value };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/send")) {
      return { ok: true, json: async () => ({ link: "whatsapp://send?phone=923001234567&text=hi", nextUnlockAt: new Date(Date.now() + 90_000).toISOString(), warnings: [], isNewChat: true, budget: budget({ dailyUsed: 13 }) }) };
    }
    if (url.endsWith("/outcome")) return { ok: true, json: async () => ({ ok: true, nextFollowupAt: null, echo: init?.body }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("SendPanel", () => {
  it("sends from the selected number with the edited message and opens WhatsApp", async () => {
    const { openLink, value } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith("whatsapp://send?phone=923001234567&text=hi"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sales/contacts/c1/send");
    expect(JSON.parse(init.body)).toEqual({ numberId: "n1", messageTemplate: expect.stringContaining("{{first_name}}"), followupInHours: 24 });
    expect(value.applyBudget).toHaveBeenCalledWith("n1", expect.objectContaining({ dailyUsed: 13 }));
  });

  it("offers 'Bring them back in' chips with 1 day chosen, and sends the chosen hours", async () => {
    setup([num()]);
    const group = screen.getByRole("group", { name: "Bring them back in" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["8 hours", "1 day", "2 days", "3 days"]);
    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "3 days" }));
    expect(screen.getByRole("button", { name: "3 days" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).followupInHours).toBe(72);
    expect((await screen.findByRole("status")).textContent).toContain("3 days");
    // The choice is spent once the message is sent.
    expect((screen.getByRole("button", { name: "8 hours" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("two fast taps request only one send", async () => {
    setup([num()]);
    const btn = screen.getByRole("button", { name: "Message on WhatsApp" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("is locked with an explanation when the agent has no number", () => {
    setup([]);
    const btn = screen.getByRole("button", { name: "No WhatsApp number yet" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/ask your admin/i)).toBeTruthy();
  });

  it("shows the countdown while spacing is running", () => {
    setup([num(budget({ nextUnlockAt: new Date(Date.now() + 74_000).toISOString() }))]);
    expect(screen.getByRole("button", { name: /^Next message unlocks in 7[34]s$/ })).toBeTruthy();
  });

  it("a server refusal shows when to try again and refreshes the budget", async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({ error: "That is the limit for this hour. Take a short break.", reason: "hourly_cap", retryAt: new Date(Date.now() + 600_000).toISOString() }),
    }));
    const { value } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Try again in 10 min\.$/)));
    expect(value.refresh).toHaveBeenCalled();
  });
});

describe("Not interested", () => {
  it("Escape logs nothing", async () => {
    setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'They asked me to stop' sends askedToStop", async () => {
    const { onOutcome } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(await screen.findByRole("button", { name: "They asked me to stop" }));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("c1", "not_interested", null));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sales/contacts/c1/outcome");
    expect(JSON.parse(init.body)).toEqual({ kind: "not_interested", askedToStop: true });
  });

  it("'Just not interested' does not mark do-not-contact", async () => {
    setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(await screen.findByRole("button", { name: "Just not interested" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kind: "not_interested" });
  });
});
