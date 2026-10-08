import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { CampaignSession } from "@/components/sales/CampaignSession";
import type { CampaignDetailJson, CampaignRecipientJson } from "@/lib/crm/campaign-ui";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { formatDateTime } from "@/lib/format";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const rec = (id: string, fullName: string, status: CampaignRecipientJson["status"] = "pending"): CampaignRecipientJson => ({
  id, contactId: `c-${id}`, fullName, phone: `+9230000000${id.slice(1).padStart(2, "0")}`, status,
});

const campaign = (over: Partial<CampaignDetailJson> = {}): CampaignDetailJson => {
  const recipients = over.recipients ?? [
    rec("r1", "Ayesha Tariq", "sent"),
    rec("r2", "Bilal Khan"),
    rec("r3", "Zainab Fatima"),
  ];
  return {
    id: "camp-1", name: "October follow-up", status: "active", recipientCount: recipients.length,
    sentCount: recipients.filter((r) => r.status === "sent").length,
    pendingCount: recipients.filter((r) => r.status === "pending").length,
    pausedReason: null, createdAt: "2026-10-01T09:00:00.000Z",
    messageTemplate: "Hi {{first_name}}, this is PZ Academy.", numberId: "n1", followupInHours: 24,
    ...over, recipients,
  };
};

const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 3, dailyCap: 30, hourlyUsed: 1, hourlyCap: 10, hourlyWarning: false, quietHours: false,
  quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const number = (b: Partial<BudgetJson> = {}, id = "n1"): AgentBudgetJson => ({
  number: { id, label: "DMC number 2", phone_e164: "+923129988112" }, budget: budget(b),
});

function budgetValue(budgets: AgentBudgetJson[] | null, over: Partial<SalesBudgetValue> = {}): SalesBudgetValue {
  return {
    budgets, loadError: false, selectedId: budgets?.[0]?.number.id ?? null, selected: budgets?.[0] ?? null,
    select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(), ...over,
  };
}

type Reply = { status: number; body: unknown };
const okSend = (over: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: {
    link: "https://wa.me/923000000002?text=hi", nextUnlockAt: "2026-10-08T10:00:00.000Z", warnings: [],
    budget: budget({ dailyUsed: 4 }), sentCount: 2, pendingCount: 1, done: false, ...over,
  },
});

function mockApi(replies: { send?: Reply[]; skip?: Reply[]; patch?: Reply[]; get?: Reply[] } = {}) {
  const queues = { send: [...(replies.send ?? [])], skip: [...(replies.skip ?? [])], patch: [...(replies.patch ?? [])], get: [...(replies.get ?? [])] };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    let r: Reply | undefined;
    if (url === "/api/sales/campaigns/camp-1/send" && method === "POST") r = queues.send.shift();
    else if (url === "/api/sales/campaigns/camp-1/skip" && method === "POST") r = queues.skip.shift();
    else if (url === "/api/sales/campaigns/camp-1" && method === "PATCH") r = queues.patch.shift();
    else if (url === "/api/sales/campaigns/camp-1" && method === "GET") r = queues.get.shift();
    const reply = r ?? { status: 500, body: {} };
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSession(initial: CampaignDetailJson, value = budgetValue([number()]), openLink = vi.fn()) {
  const utils = render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={value}>
        <CampaignSession initial={initial} openLink={openLink} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { ...utils, openLink, value };
}

const openBtn = () => screen.getByTestId("campaign-send");
const currentHeading = () => screen.getByRole("heading", { level: 2 });

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.success).mockClear();
});
afterEach(() => vi.useRealTimers());

describe("CampaignSession", () => {
  it("shows the campaign, progress, the current person and a large Open WhatsApp button", () => {
    mockApi();
    renderSession(campaign());
    expect(screen.getByText("October follow-up")).toBeTruthy();
    expect(screen.getByText("1 of 3 sent")).toBeTruthy();
    expect(currentHeading().textContent).toBe("Bilal Khan");
    expect(screen.getByText("+923000000002")).toBeTruthy();
    expect(screen.getByText("Hi Bilal, this is PZ Academy.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open WhatsApp" })).toBe(openBtn());
    expect(openBtn().className).toContain("min-h-14");
    expect((openBtn() as HTMLButtonElement).disabled).toBe(false);
  });

  it("Open WhatsApp sends the current person, opens the link, and moves on", async () => {
    const fetchMock = mockApi({ send: [okSend({ warnings: ["You are near today's limit."] })] });
    const { openLink, value } = renderSession(campaign());
    fireEvent.click(openBtn());
    await waitFor(() => expect(openLink).toHaveBeenCalledWith("https://wa.me/923000000002?text=hi"));
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/sales/campaigns/camp-1/send")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ recipientId: "r2" });
    expect(value.applyBudget).toHaveBeenCalledWith("n1", budget({ dailyUsed: 4 }));
    expect(toast.warning).toHaveBeenCalledWith("You are near today's limit.");
    expect(currentHeading().textContent).toBe("Zainab Fatima");
    expect(screen.getByText("2 of 3 sent")).toBeTruthy();
  });

  it("a double tap sends only once", async () => {
    let release!: (v: unknown) => void;
    const fetchMock = vi.fn(() => new Promise((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);
    renderSession(campaign());
    fireEvent.click(openBtn());
    fireEvent.click(openBtn());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, status: 200, json: async () => okSend().body }));
  });

  it("while the gap timer runs the button is locked and counts down", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-08T09:00:00.000Z"));
    mockApi();
    renderSession(campaign(), budgetValue([number({ nextUnlockAt: "2026-10-08T09:00:42.000Z" })]));
    expect(openBtn().textContent).toContain("Next message unlocks in 42s");
    expect((openBtn() as HTMLButtonElement).disabled).toBe(true);
    expect(openBtn().className).toContain("disabled:opacity-100");
    expect(screen.getByText("The app leaves a gap between messages to keep your sending slow and steady.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(openBtn().textContent).toContain("Next message unlocks in 41s");
  });

  it("explains a missing number", () => {
    mockApi();
    renderSession(campaign(), budgetValue([]));
    expect(openBtn().textContent).toContain("No WhatsApp number yet");
    expect((openBtn() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Ask your admin to give you a WhatsApp number. You cannot send until then.")).toBeTruthy();
  });

  it("a blocked recipient is skipped locally with a toast and the next person shows", async () => {
    mockApi({
      send: [{ status: 409, body: { error: "Could not send.", reason: "do-not-contact", retryAt: null, paused: false, recipientBlocked: true, pendingCount: 1 } }],
    });
    const { openLink } = renderSession(campaign());
    fireEvent.click(openBtn());
    await waitFor(() => expect(currentHeading().textContent).toBe("Zainab Fatima"));
    expect(toast.error).toHaveBeenCalledWith("Skipped Bilal Khan: This person asked not to be messaged.");
    expect(openLink).not.toHaveBeenCalled();
    expect(screen.getByText("1 of 3 sent")).toBeTruthy();
  });

  it("a paused response shows the Paused card with reason and retry time, and Resume lets them try again", async () => {
    const retryAt = "2026-10-09T03:00:00.000Z";
    const fetchMock = mockApi({
      send: [
        { status: 429, body: { error: "Messaging is paused overnight.", reason: "quiet_hours", retryAt, paused: true, recipientBlocked: false, pendingCount: 2 } },
        okSend(),
      ],
      patch: [{ status: 200, body: { status: "active" } }],
    });
    const { openLink } = renderSession(campaign());
    fireEvent.click(openBtn());
    expect(await screen.findByRole("heading", { name: "Paused" })).toBeTruthy();
    expect(screen.getByText("Messaging is paused overnight.")).toBeTruthy();
    expect(screen.getByText(`Try again after ${formatDateTime(retryAt)}.`)).toBeTruthy();
    expect(screen.queryByTestId("campaign-send")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open WhatsApp" })).toBeTruthy());
    const patch = fetchMock.mock.calls.find(([u, i]) => u === "/api/sales/campaigns/camp-1" && i?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ status: "active" });
    fireEvent.click(openBtn());
    await waitFor(() => expect(openLink).toHaveBeenCalled());
  });

  it("409 already-handled refetches the campaign and re-renders from it", async () => {
    const fresh = campaign({ recipients: [rec("r1", "Ayesha Tariq", "sent"), rec("r2", "Bilal Khan", "sent"), rec("r3", "Zainab Fatima")] });
    const fetchMock = mockApi({
      send: [{ status: 409, body: { error: "Already handled.", reason: "already-handled", retryAt: null, paused: false, recipientBlocked: false, pendingCount: 1 } }],
      get: [{ status: 200, body: { campaign: fresh } }],
    });
    renderSession(campaign());
    fireEvent.click(openBtn());
    await waitFor(() => expect(currentHeading().textContent).toBe("Zainab Fatima"));
    expect(fetchMock.mock.calls.some(([u, i]) => u === "/api/sales/campaigns/camp-1" && (i?.method ?? "GET") === "GET")).toBe(true);
    expect(screen.getByText("2 of 3 sent")).toBeTruthy();
  });

  it("Skip posts the current person and advances", async () => {
    const fetchMock = mockApi({ skip: [{ status: 200, body: { pendingCount: 1, done: false } }] });
    renderSession(campaign());
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(currentHeading().textContent).toBe("Zainab Fatima"));
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/sales/campaigns/camp-1/skip")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ recipientId: "r2" });
  });

  it("Pause patches paused and shows Resume; the panic button is shown", async () => {
    const fetchMock = mockApi({ patch: [{ status: 200, body: { status: "paused" } }] });
    renderSession(campaign());
    expect(screen.getByRole("button", { name: /my whatsapp warns or restricts me/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("button", { name: "Resume" })).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([u, i]) => u === "/api/sales/campaigns/camp-1" && i?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ status: "paused" });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/freeze"))).toBe(false);
  });

  it("shows All done with counts when the last person is handled", async () => {
    mockApi({ skip: [{ status: 200, body: { pendingCount: 0, done: true } }] });
    renderSession(campaign({ recipients: [rec("r1", "Ayesha Tariq", "sent"), rec("r2", "Bilal Khan")] }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(await screen.findByRole("heading", { name: "All done" })).toBeTruthy();
    expect(screen.getByText("Sent 1, skipped 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Campaigns" }).getAttribute("href")).toBe("/dashboard/sales/campaigns");
  });

  it("a campaign that is already done shows All done on load", () => {
    mockApi();
    renderSession(campaign({ status: "done", recipients: [rec("r1", "Ayesha Tariq", "sent"), rec("r2", "Bilal Khan", "blocked")] }));
    expect(screen.getByRole("heading", { name: "All done" })).toBeTruthy();
    expect(screen.getByText("Sent 1, skipped 1")).toBeTruthy();
  });

  it("selects the campaign's number on mount when it is one of the agent's numbers", () => {
    mockApi();
    const value = budgetValue([number({}, "n0"), number({}, "n1")]);
    renderSession(campaign(), value);
    expect(value.select).toHaveBeenCalledWith("n1");
  });

  it("the queue of who is next sits behind a toggle on phones", () => {
    mockApi();
    renderSession(campaign());
    const toggle = screen.getByRole("button", { name: "Show who is next" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide who is next" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("the file makes no promises about limits", () => {
    const src = readFileSync(join(process.cwd(), "src", "components", "sales", "CampaignSession.tsx"), "utf8");
    expect(src).not.toMatch(/\bsafe\b|guarantee/i);
  });
});
