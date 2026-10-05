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

const renderWs = (initialOpenId: string | null = null, initialTab: "mine" | "unclaimed" | "all" = "all") =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue}>
        <ContactsWorkspace viewerId={ME} initialTab={initialTab} initialOpenId={initialOpenId} />
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
