import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { CampaignSession } from "@/components/sales/CampaignSession";
import type { CampaignDetailJson, CampaignRecipientJson } from "@/lib/crm/campaign-ui";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { MAX_MESSAGE_LENGTH } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const stubDesktop = (desktop: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: desktop, media: q, addEventListener: () => {}, removeEventListener: () => {} }));

const rec = (id: string, fullName: string): CampaignRecipientJson => ({
  id, contactId: `c-${id}`, fullName, phone: "+923000000002", status: "pending",
});
const TEMPLATE = "Hi {{first_name}}, this is PZ Academy.";
const campaign = (over: Partial<CampaignDetailJson> = {}): CampaignDetailJson => {
  const recipients = [rec("r1", "Bilal Khan"), rec("r2", "Zainab Fatima"), rec("r3", "Omar Sheikh")];
  return {
    id: "camp-1", name: "October follow-up", status: "active", recipientCount: 3, sentCount: 0, pendingCount: 3,
    pausedReason: null, createdAt: "2026-10-01T09:00:00.000Z", messageTemplate: TEMPLATE, numberId: "n1",
    followupInHours: 24, recipients, ...over,
  };
};
const budget = (): BudgetJson => ({
  dailyUsed: 3, dailyCap: 30, hourlyUsed: 1, hourlyCap: 10, hourlyWarning: false, quietHours: false,
  quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null,
});
const num: AgentBudgetJson = { number: { id: "n1", label: "DMC", phone_e164: "+923129988112" }, budget: budget() };
const ctx = (): SalesBudgetValue => ({
  budgets: [num], loadError: false, selectedId: "n1", selected: num,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
});

let reply: { status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;
const okBody = () => ({ link: "https://wa.me/1?text=x", nextUnlockAt: "x", warnings: [], budget: budget(), sentCount: 1, pendingCount: 2, done: false });

beforeEach(() => {
  vi.unstubAllGlobals();
  stubDesktop(false);
  window.sessionStorage.clear();
  window.sessionStorage.setItem("pz-whatsapp-mode:campaign:camp-1", "app");
  vi.mocked(toast.error).mockClear();
  reply = { status: 200, body: okBody() };
  fetchMock = vi.fn(async () => ({ ok: reply.status < 300, status: reply.status, json: async () => reply.body }));
  vi.stubGlobal("fetch", fetchMock);
});

function renderIt(initial = campaign()) {
  const openLink = vi.fn();
  const preOpen = vi.fn(() => ({ blocked: false, navigate: vi.fn(), closeIfBlank: vi.fn(), isClosed: () => false }));
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={ctx()}>
        <CampaignSession initial={initial} openLink={openLink} preOpen={preOpen} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { openLink, preOpen };
}
const editLink = () => screen.getByRole("button", { name: "Edit message" });
const box = () => screen.getByLabelText("Message for this person") as HTMLTextAreaElement;
const rest = () => screen.getByRole("checkbox", { name: "Use this wording for everyone after them too" }) as HTMLInputElement;
const send = () => screen.getByTestId("campaign-send") as HTMLButtonElement;
const sentBody = (n = 0) => JSON.parse(String((fetchMock.mock.calls[n][1] as RequestInit).body));

describe("campaign edit message", () => {
  it("shows a small Edit message link and no box until it is opened", () => {
    renderIt();
    expect(editLink().className).toContain("min-h-11");
    expect(screen.queryByLabelText("Message for this person")).toBeNull();
  });

  it("opens a labelled box pre-filled with the raw template, with the checkbox off", () => {
    renderIt();
    fireEvent.click(editLink());
    expect(box().value).toBe(TEMPLATE);
    expect(box().maxLength).toBe(MAX_MESSAGE_LENGTH);
    expect(rest().checked).toBe(false);
  });

  it("updates the preview live", () => {
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    expect(screen.getByText("Salam Bilal!")).toBeTruthy();
  });

  it("an unedited send carries no override", async () => {
    renderIt();
    fireEvent.click(send());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ recipientId: "r1" });
  });

  it("sends the override, then closes the box and reverts to the campaign message", async () => {
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(send());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ recipientId: "r1", messageOverride: "Salam {{first_name}}!", applyToRest: false });
    await waitFor(() => expect(screen.queryByLabelText("Message for this person")).toBeNull());
    expect(screen.getByText("Hi Zainab, this is PZ Academy.")).toBeTruthy();
  });

  it("applyToRest keeps the new wording for the next person", async () => {
    reply = { status: 200, body: { ...okBody(), messageTemplate: "Salam {{first_name}}!", templateSaved: true } };
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(rest());
    fireEvent.click(send());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().applyToRest).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText("Message for this person")).toBeNull());
    expect(screen.getByText("Salam Zainab!")).toBeTruthy();
  });

  it("a refused send keeps the box, the text and the checkbox", async () => {
    reply = { status: 429, body: { error: "Too soon", reason: "spacing" } };
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(rest());
    fireEvent.click(send());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(box().value).toBe("Salam {{first_name}}!");
    expect(rest().checked).toBe(true);
  });

  it("disables the box while sending", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderIt();
    fireEvent.click(editLink());
    fireEvent.click(send());
    await waitFor(() => expect(box().disabled).toBe(true));
    expect(rest().disabled).toBe(true);
  });

  it("an empty message disables sending with a hint", () => {
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "   " } });
    expect(send().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/write a message/i);
  });

  it("a nameless message with the checkbox on and several people left disables sending", () => {
    const four = [rec("r1", "Bilal Khan"), rec("r2", "Zainab Fatima"), rec("r3", "Omar Sheikh"), rec("r4", "Sana Mir")];
    renderIt(campaign({ recipients: four, recipientCount: 4, pendingCount: 4 }));
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Same for everyone" } });
    expect(send().disabled).toBe(false);
    fireEvent.click(rest());
    expect(send().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("{{first_name}}");
  });

  it("the Open in WhatsApp Web button sends the override too", async () => {
    stubDesktop(true);
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(screen.getByRole("button", { name: "Open in WhatsApp Web" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().messageOverride).toBe("Salam {{first_name}}!");
  });

  it("after a server variety refusal the editor and text stay and the message is shown", async () => {
    reply = { status: 400, body: { error: "Add a name please", reason: "variety" } };
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Same for everyone" } });
    fireEvent.click(send());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add a name please"));
    expect(box().value).toBe("Same for everyone");
  });

  it("the stored template comes from the response, not the draft", async () => {
    reply = { status: 200, body: { ...okBody(), messageTemplate: TEMPLATE, templateSaved: false } };
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(rest());
    fireEvent.click(send());
    await waitFor(() => expect(screen.queryByLabelText("Message for this person")).toBeNull());
    expect(screen.getByText("Hi Zainab, this is PZ Academy.")).toBeTruthy();
    expect(toast.warning).toHaveBeenCalled();
  });

  it("the editor closes when the person is skipped", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, status: 200, json: async () => (String(url).endsWith("/skip") ? { done: false } : okBody()),
    }));
    renderIt();
    fireEvent.click(editLink());
    fireEvent.click(screen.getByRole("button", { name: /Skip this person/ }));
    await waitFor(() => expect(screen.queryByLabelText("Message for this person")).toBeNull());
  });

  it("moves focus into the box on open, links the hint, and returns focus to the link on close", () => {
    renderIt();
    fireEvent.click(editLink());
    expect(document.activeElement).toBe(box());
    fireEvent.change(box(), { target: { value: "" } });
    const ids = box().getAttribute("aria-describedby")!.split(" ");
    expect(ids.some((id) => document.getElementById(id)?.getAttribute("role") === "alert")).toBe(true);
    expect(box().className).toContain("focus-visible:ring-pz-primary");
    fireEvent.click(screen.getByRole("button", { name: "Use the campaign message" }));
    expect(document.activeElement).toBe(editLink());
  });

  it("the chooser dialog path carries the override", async () => {
    stubDesktop(true);
    window.sessionStorage.clear();
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "Salam {{first_name}}!" } });
    fireEvent.click(send());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button")[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().messageOverride).toBe("Salam {{first_name}}!");
  });

  it("Use the campaign message closes the box and goes back", () => {
    renderIt();
    fireEvent.click(editLink());
    fireEvent.change(box(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Use the campaign message" }));
    expect(screen.queryByLabelText("Message for this person")).toBeNull();
    expect(screen.getByText("Hi Bilal, this is PZ Academy.")).toBeTruthy();
  });
});
