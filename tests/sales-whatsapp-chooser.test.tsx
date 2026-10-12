import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { SendPanel } from "@/components/sales/SendPanel";
import { CampaignSession } from "@/components/sales/CampaignSession";
import type { CampaignDetailJson } from "@/lib/crm/campaign-ui";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import type { WebTabHandle } from "@/lib/crm/whatsapp-mode";
import { toast } from "sonner";

const stubDesktop = (desktop: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: desktop, media: q, addEventListener: () => {}, removeEventListener: () => {} }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const APP = "whatsapp://send?phone=923001234567&text=hi";
const WEB = "https://web.whatsapp.com/send?phone=923001234567&text=hi";

const budget = (): BudgetJson => ({
  dailyUsed: 3, dailyCap: 30, hourlyUsed: 1, hourlyCap: 10, hourlyWarning: false, quietHours: false,
  quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null,
});
const num: AgentBudgetJson = { number: { id: "n1", label: "My phone", phone_e164: null }, budget: budget() };
const value = (): SalesBudgetValue => ({
  budgets: [num], loadError: false, selectedId: "n1", selected: num,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
});

const tab = () => ({
  blocked: false as boolean,
  navigate: vi.fn<(url: string) => void>(),
  closeIfBlank: vi.fn<() => void>(),
  isClosed: vi.fn<() => boolean>(() => false),
}) satisfies WebTabHandle;

let sendReply: { ok: boolean; status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  stubDesktop(true);
  window.sessionStorage.clear();
  vi.mocked(toast.warning).mockClear();
  sendReply = { ok: true, status: 200, body: { link: APP, warnings: [], isNewChat: true, nextUnlockAt: "x", budget: budget(), sentCount: 1, pendingCount: 1, done: false } };
  fetchMock = vi.fn(async () => ({ ok: sendReply.ok, status: sendReply.status, json: async () => sendReply.body }));
  vi.stubGlobal("fetch", fetchMock);
});

const contact = { id: "c1", full_name: "Ayesha Tariq", phone_e164: "+923001234567", warm: false, recently_contacted: false };

function renderPanel(extra: { onSent?: (id: string) => void; pre?: ReturnType<typeof tab> } = {}) {
  const openLink = vi.fn<(url: string) => void>();
  const pre = extra.pre ?? tab();
  const preOpen = vi.fn<() => WebTabHandle>(() => pre);
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={value()}>
        <SendPanel contact={contact} templates={[]} onOutcome={vi.fn()} onSent={extra.onSent} openLink={openLink} preOpen={preOpen} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { openLink, pre, preOpen };
}

const campaign: CampaignDetailJson = {
  id: "camp-1", name: "Oct", status: "active", recipientCount: 3, sentCount: 0, pendingCount: 3, pausedReason: null,
  createdAt: "2026-10-01T09:00:00.000Z", messageTemplate: "Hi", numberId: "n1", followupInHours: 24,
  recipients: [
    { id: "r1", contactId: "c-r1", fullName: "Ayesha Tariq", phone: "+923000000001", status: "pending" },
    { id: "r2", contactId: "c-r2", fullName: "Bilal Khan", phone: "+923000000002", status: "pending" },
    { id: "r3", contactId: "c-r3", fullName: "Zainab Fatima", phone: "+923000000003", status: "pending" },
  ],
};
function renderSession(extra: { pre?: ReturnType<typeof tab> } = {}) {
  const openLink = vi.fn<(url: string) => void>();
  const pre = extra.pre ?? tab();
  const preOpen = vi.fn<() => WebTabHandle>(() => pre);
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={value()}>
        <CampaignSession initial={campaign} openLink={openLink} preOpen={preOpen} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { openLink, pre, preOpen };
}

describe("SendPanel chooser", () => {
  it("asks on the first click, sends nothing yet, then remembers the choice", async () => {
    const { openLink } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp app" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(APP));
    expect(window.sessionStorage.getItem("pz-whatsapp-mode:send-panel")).toBe("app");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not ask on the second click", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "app");
    const { openLink } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Change asks again", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "app");
    renderPanel();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("Web: pre-opens the tab synchronously at the click, before the server answers, then navigates it", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => sendReply.body }); }));
    const { pre, preOpen, openLink } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    expect(preOpen).toHaveBeenCalledTimes(1);
    expect(pre.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    release();
    await waitFor(() => expect(pre.navigate).toHaveBeenCalledWith(WEB));
    expect(openLink).not.toHaveBeenCalled();
    expect(pre.closeIfBlank).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open WhatsApp again", hidden: true }).getAttribute("href")).toBe(WEB);
  });

  it("Web: closes the placeholder tab when the server refuses", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    sendReply = { ok: false, status: 429, body: { error: "Too soon", reason: "spacing" } };
    const { pre } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(pre.closeIfBlank).toHaveBeenCalled());
    expect(pre.navigate).not.toHaveBeenCalled();
  });

  it("App: never pre-opens", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "app");
    const { preOpen, openLink } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(APP));
    expect(preOpen).not.toHaveBeenCalled();
  });
});

describe("CampaignSession chooser", () => {
  it("asks once per campaign, then web pre-opens and navigates; the again link uses the web form", async () => {
    const { pre, preOpen } = renderSession();
    fireEvent.click(screen.getByTestId("campaign-send"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp Web" }));
    expect(preOpen).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pre.navigate).toHaveBeenCalledWith(WEB));
    expect(window.sessionStorage.getItem("pz-whatsapp-mode:campaign:camp-1")).toBe("web");
    expect(screen.getByRole("link", { name: /Open WhatsApp again for Ayesha/ }).getAttribute("href")).toBe(WEB);
    fireEvent.click(screen.getByTestId("campaign-send"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the placeholder when the server refuses", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:campaign:camp-1", "web");
    sendReply = { ok: false, status: 429, body: { error: "Too soon", reason: "spacing" } };
    const { pre } = renderSession();
    fireEvent.click(screen.getByTestId("campaign-send"));
    await waitFor(() => expect(pre.closeIfBlank).toHaveBeenCalled());
    expect(pre.navigate).not.toHaveBeenCalled();
  });

  it("Change re-asks", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:campaign:camp-1", "app");
    renderSession();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("fix round", () => {
  it("phones: no chooser, always the app, no Change link, never pre-opens", async () => {
    stubDesktop(false);
    const { openLink, preOpen } = renderPanel();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(APP));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(preOpen).not.toHaveBeenCalled();
  });

  it("phones ignore a saved Web choice", async () => {
    stubDesktop(false);
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    const { openLink, preOpen } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(APP));
    expect(preOpen).not.toHaveBeenCalled();
  });

  it("Change keeps the old choice until a new one is picked (dismissing keeps it)", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.sessionStorage.getItem("pz-whatsapp-mode:send-panel")).toBe("web");
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("when storage fails, the in-memory choice still stops the chooser from reappearing", async () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    try {
      const { openLink } = renderPanel();
      fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
      fireEvent.click(await screen.findByRole("button", { name: "WhatsApp app" }));
      await waitFor(() => expect(openLink).toHaveBeenCalledTimes(1));
      await waitFor(() => expect((screen.getByRole("button", { name: "Message on WhatsApp" }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
      await waitFor(() => expect(openLink).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      setSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  it("the again link uses the mode of that send and the named tab for Web", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    const link = await screen.findByRole("link", { name: "Open WhatsApp again" });
    expect(link.getAttribute("target")).toBe("pz-whatsapp-web");
    expect(link.getAttribute("rel")).toBeNull();
    expect(link.getAttribute("href")).toBe(WEB);
    // Opening the chooser (Change) without picking does not alter what that link points at.
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("link", { name: "Open WhatsApp again", hidden: true }).getAttribute("href")).toBe(WEB);
  });

  it("falls back to openLink and warns when the popup was blocked", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    const pre = { ...tab(), blocked: true };
    const { openLink } = renderPanel({ pre });
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(WEB));
    expect(pre.navigate).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/popup/i));
  });

  it("falls back to openLink when the pre-opened tab was closed before approval", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    const pre = tab();
    pre.isClosed.mockReturnValue(true);
    const { openLink } = renderPanel({ pre });
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(WEB));
    expect(pre.navigate).not.toHaveBeenCalled();
  });

  it("a throwing onSent cannot close the tab after approval", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    const pre = tab();
    renderPanel({ pre, onSent: () => { throw new Error("parent broke"); } });
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(pre.navigate).toHaveBeenCalledWith(WEB));
    expect(pre.closeIfBlank).not.toHaveBeenCalled();
  });

  it("Change is disabled while a send is in flight", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:send-panel", "web");
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Change" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("CampaignSession: Web tab is pre-opened at the click but only navigated after the server answers", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:campaign:camp-1", "web");
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => sendReply.body }); }));
    const { pre, preOpen } = renderSession();
    fireEvent.click(screen.getByTestId("campaign-send"));
    expect(preOpen).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(pre.navigate).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(pre.navigate).toHaveBeenCalledWith(WEB));
    expect(pre.closeIfBlank).not.toHaveBeenCalled();
  });

  it("CampaignSession: phones skip the chooser and use the app", async () => {
    stubDesktop(false);
    const { openLink, preOpen } = renderSession();
    fireEvent.click(screen.getByTestId("campaign-send"));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(APP));
    expect(preOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("CampaignSession: blocked popup falls back to openLink with a warning", async () => {
    window.sessionStorage.setItem("pz-whatsapp-mode:campaign:camp-1", "web");
    const pre = { ...tab(), blocked: true };
    const { openLink } = renderSession({ pre });
    fireEvent.click(screen.getByTestId("campaign-send"));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith(WEB));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/popup/i));
  });
});

describe("source guards", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "src", "components", "sales", f), "utf8");
  for (const f of ["SendPanel.tsx", "CampaignSession.tsx"]) {
    it(`${f} pre-opens the tab before the first await in its click path`, () => {
      const src = read(f);
      const start = src.indexOf("const startSend");
      expect(start).toBeGreaterThan(-1);
      const firstAwait = src.indexOf("await", start);
      const pre = src.indexOf("preOpen()", start);
      expect(pre).toBeGreaterThan(-1);
      expect(firstAwait === -1 || pre < firstAwait).toBe(true);
    });
    it(`${f} guards the placeholder with a finally, and navigates only after the fetch`, () => {
      const src = read(f);
      expect(src).toMatch(/finally\s*\{[^}]*closeIfBlank\(\)/);
      const fetchAt = src.indexOf("await fetch(");
      const navAt = src.indexOf(".navigate(");
      expect(fetchAt).toBeGreaterThan(-1);
      expect(navAt).toBeGreaterThan(fetchAt);
      expect(src).toMatch(/linkForMode\(/);
      expect(src).toMatch(/desktop/);
    });
  }
});
