import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { ContactsWorkspace } from "@/components/sales/ContactsWorkspace";
import type { ContactDetailJson, ContactRowJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const ME = "me-1";
const row = (id: string, full_name: string, over: Partial<ContactRowJson> = {}): ContactRowJson => ({
  id, full_name, phone_e164: "+923001234567", owner_id: ME, owner_name: "Sara", last_outcome: null,
  next_followup_at: null, do_not_contact_at: null, ...over,
});
const budgetValue: SalesBudgetValue = {
  budgets: [], loadError: false, selectedId: null, selected: null,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
};

function mockApi(rows: ContactRowJson[], details: Record<string, ContactDetailJson>, claim?: { ok: boolean; status?: number }) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/sales/contacts?")) return { ok: true, json: async () => ({ rows, total: rows.length, pageSize: 30 }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: [] }) };
    if (url.endsWith("/claim") && init?.method === "POST")
      return { ok: claim?.ok ?? true, status: claim?.status ?? 200, json: async () => (claim?.ok === false ? { error: "Someone else already claimed this contact." } : { ok: true }) };
    const m = url.match(/^\/api\/sales\/contacts\/([^/?]+)$/);
    if (m) return { ok: true, json: async () => details[m[1]] };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const renderWs = (initialOpenId: string | null = null, initialTab: "mine" | "unclaimed" | "all" = "all", canClaim = true) =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue}>
        <ContactsWorkspace viewerId={ME} initialTab={initialTab} initialOpenId={initialOpenId} canClaim={canClaim} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );

beforeEach(() => vi.unstubAllGlobals());

describe("ContactsWorkspace", () => {
  it("shows owner state and masked phones on the All tab", async () => {
    mockApi([row("a", "Ayesha"), row("b", "Bilal", { owner_id: "other", owner_name: "Hina", phone_e164: null }), row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs();
    expect(await screen.findByText("Owned by Hina")).toBeTruthy();
    expect(screen.getByText("Phone hidden")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claim" })).toBeTruthy();
  });

  it("a restricted contact shows no phone, no timeline and no actions", async () => {
    mockApi([], {
      x: {
        contact: { id: "x", full_name: "Bilal", phone_e164: null, owner_id: "other", owner_name: "Hina", last_outcome: "interested", next_followup_at: null, do_not_contact_at: null, email: null, profession: null },
        timeline: [],
        canAct: false,
        restricted: true,
      },
    });
    renderWs("x");
    expect(await screen.findByText(/belongs to another agent/i)).toBeTruthy();
    expect(screen.queryByText("+923001234567")).toBeNull();
    expect(screen.queryByRole("button", { name: /message on whatsapp/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Timeline" })).toBeNull();
  });

  it("claiming an unclaimed contact posts and reloads", async () => {
    const f = mockApi([row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs(null, "unclaimed");
    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/sales/contacts/c/claim", expect.objectContaining({ method: "POST" })));
  });

  it("an own contact with do-not-contact shows the stop banner and no send panel", async () => {
    mockApi([], {
      d: {
        contact: { id: "d", full_name: "Dua", phone_e164: "+923001234567", owner_id: ME, owner_name: "Sara", last_outcome: "not_interested", next_followup_at: null, do_not_contact_at: "2026-10-01T10:00:00.000Z", email: null, profession: null },
        timeline: [{ id: "t1", kind: "not_interested", body: "Asked me to stop", agent_name: "Sara", created_at: "2026-10-01T10:00:00.000Z" }],
        canAct: true,
        restricted: false,
      },
    });
    renderWs("d");
    expect(await screen.findByText(/asked not to be contacted/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /message on whatsapp/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeTruthy();
  });
});

describe("claiming turned off (canClaim false)", () => {
  const unclaimedDetail: ContactDetailJson = {
    contact: { id: "u", full_name: "Chand", phone_e164: "+923001234567", owner_id: null, owner_name: null, last_outcome: null, next_followup_at: null, do_not_contact_at: null, whatsapp_unsubscribed_at: null, email: null, profession: null },
    timeline: [],
    canAct: true,
    restricted: false,
  };

  it("an unclaimed row has no Claim button and the Unclaimed tab shows the view-only note", async () => {
    mockApi([row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs(null, "unclaimed", false);
    expect(await screen.findByText("Chand")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
    expect(screen.getByText("Unassigned contacts are view-only. Your admin assigns contacts to you.")).toBeTruthy();
  });

  it("with canClaim true the Claim button still renders and there is no view-only note", async () => {
    mockApi([row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs(null, "unclaimed", true);
    expect(await screen.findByRole("button", { name: "Claim" })).toBeTruthy();
    expect(screen.queryByText("Unassigned contacts are view-only. Your admin assigns contacts to you.")).toBeNull();
  });

  it("the Mine empty state tells the agent the admin assigns contacts", async () => {
    mockApi([], {});
    renderWs(null, "mine", false);
    expect(await screen.findByText("Your admin assigns contacts to you. They will show up here.")).toBeTruthy();
    expect(screen.queryByText("Claim contacts from the Unclaimed tab to start.")).toBeNull();
  });

  it("the Mine empty state keeps the claim hint when claiming is on", async () => {
    mockApi([], {});
    renderWs(null, "mine", true);
    expect(await screen.findByText("Claim contacts from the Unclaimed tab to start.")).toBeTruthy();
  });

  it("the detail pane has no Claim to my list button for an unclaimed contact", async () => {
    mockApi([], { u: unclaimedDetail });
    renderWs("u", "all", false);
    expect(await screen.findByRole("heading", { level: 2, name: "Chand" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim to my list" })).toBeNull();
  });

  it("the detail pane keeps Claim to my list when claiming is on", async () => {
    mockApi([], { u: unclaimedDetail });
    renderWs("u", "all", true);
    expect(await screen.findByRole("button", { name: "Claim to my list" })).toBeTruthy();
  });
});

const ownDetail = (id: string, over: Partial<ContactDetailJson["contact"]> = {}, canAct = true): ContactDetailJson => ({
  contact: { id, full_name: "Ayesha", phone_e164: "+923001234567", owner_id: ME, owner_name: "Sara", last_outcome: null, next_followup_at: null, do_not_contact_at: null, whatsapp_unsubscribed_at: null, email: null, profession: null, ...over },
  timeline: [],
  canAct,
  restricted: false,
});
const stubPhone = (phone: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: phone, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }));
const sheetEl = (c: HTMLElement) => c.querySelector('[aria-label="Contact details"]') as HTMLElement | null;

describe("phone contact sheet", () => {
  it("is a modal dialog layered below the z-50 dialogs and above the top bar", async () => {
    stubPhone(true);
    mockApi([row("a", "Ayesha")], { a: ownDetail("a") });
    const { container } = renderWs("a");
    await screen.findByText("Timeline");
    const sheet = sheetEl(container)!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    const z = Number(/\bz-(\d+)\b/.exec(sheet.className)?.[1]);
    expect(z).toBeGreaterThan(30);
    expect(z).toBeLessThan(50);
    expect(sheet.className).not.toContain("z-[60]");
  });

  it("is not a dialog on desktop", async () => {
    stubPhone(false);
    mockApi([row("a", "Ayesha")], { a: ownDetail("a") });
    const { container } = renderWs("a");
    await screen.findByText("Timeline");
    expect(sheetEl(container)!.getAttribute("role")).toBeNull();
  });

  it("moves focus in, Escape returns to the list and restores focus to the row", async () => {
    stubPhone(true);
    mockApi([row("a", "Ayesha")], { a: ownDetail("a") });
    const { container } = renderWs();
    const rowBtn = await screen.findByRole("button", { name: /Ayesha/ });
    rowBtn.focus();
    fireEvent.click(rowBtn);
    await screen.findByText("Timeline");
    expect(sheetEl(container)!.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? sheetEl(container)!, { key: "Escape" });
    await waitFor(() => expect(sheetEl(container)).toBeNull());
    expect(document.activeElement).toBe(rowBtn);
  });

  it("the Not interested dialog opens and its Escape closes only the dialog, not the sheet", async () => {
    stubPhone(true);
    mockApi([row("a", "Ayesha")], { a: ownDetail("a") });
    const { container } = renderWs("a");
    fireEvent.click(await screen.findByRole("button", { name: "Not interested" }));
    const dialog = await screen.findByRole("dialog", { name: /ask you to stop/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /ask you to stop/i })).toBeNull());
    expect(sheetEl(container)).not.toBeNull();
  });
});

describe("phone sheet Escape after an inner dialog closes", () => {
  it("still closes the sheet when focus fell back to the body", async () => {
    stubPhone(true);
    mockApi([row("a", "Ayesha")], { a: ownDetail("a") });
    const { container } = renderWs("a");
    fireEvent.click(await screen.findByRole("button", { name: "Not interested" }));
    const dialog = await screen.findByRole("dialog", { name: /ask you to stop/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /ask you to stop/i })).toBeNull());
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(sheetEl(container)).toBeNull());
  });
});

describe("standalone note box", () => {
  const noteLabel = /Note \(your team can see it\)/;
  it("shows for an own do-not-contact contact and saves a note", async () => {
    const f = mockApi([], { d: ownDetail("d", { do_not_contact_at: "2026-10-01T10:00:00.000Z" }) });
    renderWs("d");
    const box = await screen.findByRole("textbox", { name: noteLabel });
    fireEvent.change(box, { target: { value: "Called back, wants nothing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/sales/contacts/d/note", expect.objectContaining({ method: "POST" })));
  });
  it("shows for an own contact with no phone", async () => {
    mockApi([], { p: ownDetail("p", { phone_e164: null }) });
    renderWs("p");
    expect(await screen.findByRole("textbox", { name: noteLabel })).toBeTruthy();
  });
  it("is not shown for unclaimed contacts", async () => {
    mockApi([], { u: ownDetail("u", { owner_id: null, owner_name: null }, false) });
    renderWs("u");
    await screen.findByText("Timeline");
    expect(screen.queryByRole("textbox", { name: noteLabel })).toBeNull();
  });
  it("appears once when the send panel is present", async () => {
    mockApi([], { a: ownDetail("a") });
    renderWs("a");
    await screen.findByRole("textbox", { name: /Your message/ });
    expect(screen.getAllByRole("textbox", { name: noteLabel })).toHaveLength(1);
  });
});

describe("unsubscribed contacts", () => {
  it("flags an own unsubscribed contact and hides the send panel", async () => {
    mockApi([], { s: ownDetail("s", { whatsapp_unsubscribed_at: "2026-10-01T10:00:00.000Z" }) });
    renderWs("s");
    expect(await screen.findByText(/unsubscribed from WhatsApp/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Your message/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /message on whatsapp/i })).toBeNull();
  });
  it("a restricted viewer sees no flag", async () => {
    mockApi([], {
      x: {
        contact: { id: "x", full_name: "Bilal", phone_e164: null, owner_id: "other", owner_name: "Hina", last_outcome: null, next_followup_at: null, do_not_contact_at: null, whatsapp_unsubscribed_at: null, email: null, profession: null },
        timeline: [], canAct: false, restricted: true,
      },
    });
    renderWs("x");
    await screen.findByText(/belongs to another agent/i);
    expect(screen.queryByText(/unsubscribed/i)).toBeNull();
  });
});

describe("locked cards", () => {
  it("dim the avatar, not the text", async () => {
    mockApi([row("b", "Bilal", { owner_id: "other", owner_name: "Hina", phone_e164: null })], {});
    renderWs();
    const name = await screen.findByText("Bilal");
    const card = name.closest("li")!.firstElementChild as HTMLElement;
    expect(card.className).not.toMatch(/\bopacity-\d+/);
  });
});
