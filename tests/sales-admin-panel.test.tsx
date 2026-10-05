import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SafetyLimitsPanel } from "@/components/admin/sales/SafetyLimitsPanel";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const numbers = [
  { id: "n1", label: "DMC 2", phone_e164: "+923001234567", status: "frozen", frozen_until: "2099-01-01T00:00:00.000Z",
    warmup_started_on: "2026-01-01", daily_cap: null, hourly_cap: null, created_at: "2026-01-01T00:00:00Z", agents: [{ id: "ag1", name: "Sara" }] },
];
const budgets = [{ number: { id: "n1", label: "DMC 2", phone_e164: "+923001234567" }, budget: {
  dailyUsed: 14, dailyCap: 60, hourlyUsed: 4, hourlyCap: 20, hourlyWarning: false, quietHours: false, quietEndsAt: null,
  frozen: true, frozenUntil: "2099-01-01T00:00:00.000Z", nextUnlockAt: null } }];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/sales/numbers" && !init?.method) return { ok: true, json: async () => ({ numbers }) };
    if (url.startsWith("/api/sales/budget")) return { ok: true, json: async () => ({ budgets }) };
    if (url === "/api/admin/sales/settings" && !init?.method) return { ok: true, json: async () => ({ settings: DEFAULT_SETTINGS }) };
    if (url === "/api/admin/sales/settings" && init?.method === "PUT") return { ok: true, json: async () => ({ settings: { ...DEFAULT_SETTINGS, daily_cap: 40 } }) };
    if (url.startsWith("/api/admin/sales/blocked-attempts")) return { ok: true, json: async () => ({ rows: [] }) };
    if (url === "/api/admin/sales/numbers/n1" && init?.method === "PATCH") return { ok: true, json: async () => ({ ok: true }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const renderPanel = () =>
  render(<ConfirmProvider><SafetyLimitsPanel agents={[{ id: "ag1", fullName: "Sara" }]} /></ConfirmProvider>);

describe("SafetyLimitsPanel", () => {
  it("shows usage, the paused banner and the admin batch note", async () => {
    renderPanel();
    expect(await screen.findByText("14 of 60 new chats used today")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/DMC 2/);
    expect(screen.getByText(/not counted/i)).toBeTruthy();
  });

  it("saves only the changed settings", async () => {
    renderPanel();
    const input = await screen.findByLabelText("New chats per day, per number");
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save settings" })[0]);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([u, i]) => u === "/api/admin/sales/settings" && i?.method === "PUT");
      expect(put && JSON.parse(put[1].body)).toEqual({ daily_cap: 40 });
    });
  });

  it("unpausing asks first and then patches unfreeze", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Unpause DMC 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unpause" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u, i]) => u === "/api/admin/sales/numbers/n1" && i?.method === "PATCH");
      expect(patch && JSON.parse(patch[1].body)).toEqual({ unfreeze: true });
    });
  });

  it("keeps unsaved rule edits when a number action refreshes the page data", async () => {
    renderPanel();
    const input = (await screen.findByLabelText("New chats per day, per number")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.click(await screen.findByRole("button", { name: "Unpause DMC 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unpause" }));
    await waitFor(() => {
      const gets = fetchMock.mock.calls.filter(([u, i]) => u === "/api/admin/sales/settings" && !i?.method);
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
    expect((screen.getByLabelText("New chats per day, per number") as HTMLInputElement).value).toBe("40");
  });

  it("rejects an invalid phone before sending and sends the E.164 form otherwise", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Add WhatsApp number" }));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "New one" } });
    fireEvent.change(screen.getByLabelText("Phone number (optional)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add number" }));
    expect((await screen.findAllByRole("alert")).some((a) => /not valid/.test(a.textContent ?? ""))).toBe(true);
    expect(fetchMock.mock.calls.some(([u, i]) => u === "/api/admin/sales/numbers" && i?.method === "POST")).toBe(false);
    fireEvent.change(screen.getByLabelText("Phone number (optional)"), { target: { value: "0300 1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Add number" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, i]) => u === "/api/admin/sales/numbers" && i?.method === "POST");
      expect(post && JSON.parse(post[1].body).phoneE164).toBe("+923001234567");
    });
  });

  it("says how long an admin pause lasts", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/sales/numbers" && !init?.method) return { ok: true, json: async () => ({ numbers: [{ ...numbers[0], status: "active", frozen_until: null }] }) };
      if (url.startsWith("/api/sales/budget")) return { ok: true, json: async () => ({ budgets: [{ ...budgets[0], budget: { ...budgets[0].budget, frozen: false } }] }) };
      if (url === "/api/admin/sales/settings") return { ok: true, json: async () => ({ settings: DEFAULT_SETTINGS }) };
      if (url.startsWith("/api/admin/sales/blocked-attempts")) return { ok: true, json: async () => ({ rows: [] }) };
      return { ok: false, json: async () => ({}) };
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Pause DMC 2" }));
    expect(await screen.findByText(/for 48 hours/)).toBeTruthy();
  });
});
