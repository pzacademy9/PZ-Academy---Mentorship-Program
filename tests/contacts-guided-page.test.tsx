import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SalesHubContactsPage from "@/app/dashboard/admin/sales-hub/contacts/page";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: vi.fn(async () => undefined) }));
vi.mock("@/lib/data/admin-crm-contacts", () => ({ listContacts: vi.fn(async () => ({ rows: [], total: 0 })) }));

function person(n: number): ContactRow {
  return {
    id: `c${n}`, fullName: `Person ${n}`, email: `person${n}@example.com`, phoneE164: `+9230000${String(n).padStart(5, "0")}`,
    country: "Pakistan", discoverySource: "sheet", purchaseCount: 0, productLabels: [], unsubscribed: false,
  };
}
const okJson = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/admin/crm/contacts") {
      const offset = Number(url.searchParams.get("offset"));
      const q = url.searchParams.get("search");
      const rows = q ? [person(900), person(901)] : Array.from({ length: 50 }, (_, i) => person(offset + i));
      return okJson({ rows, total: q ? 2 : 120 });
    }
    if (url.pathname.endsWith("/field-values")) return okJson({ values: [] });
    if (url.pathname.endsWith("/import/batches")) return okJson({ batches: [] });
    return okJson({ courses: [] });
  }));
});

describe("Contacts guided page", () => {
  it("shows the heading and the new intro line", async () => {
    render(await SalesHubContactsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Contacts" })).toBeTruthy();
    expect(screen.getByText("Everyone who has registered or bought. Find people, then choose what to do.")).toBeTruthy();
  });

  it("has the three step headings in order and does not steal focus", () => {
    render(<ContactsPanel initialRows={Array.from({ length: 50 }, (_, i) => person(i))} initialTotal={120} />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\s+/g, " ").trim());
    expect(names).toEqual(["1 Find people", "2 Pick people", "3 What do you want to do?"]);
    expect(document.activeElement).toBe(document.body);
  });

  it("search, tick two, count shows, page change keeps picks", async () => {
    render(<ContactsPanel initialRows={Array.from({ length: 50 }, (_, i) => person(i))} initialTotal={120} />);
    fireEvent.change(screen.getByLabelText("Search by name, email or phone"), { target: { value: "person" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByLabelText("Select Person 900")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Select Person 900"));
    fireEvent.click(screen.getByLabelText("Select Person 901"));
    expect(screen.getByText("2 people selected")).toBeTruthy();
  });

  it("keeps picks when the page changes", async () => {
    render(<ContactsPanel initialRows={Array.from({ length: 50 }, (_, i) => person(i))} initialTotal={120} />);
    fireEvent.click(screen.getByLabelText("Select Person 0"));
    fireEvent.click(screen.getByLabelText("Select Person 1"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByLabelText("Select Person 50")).toBeTruthy());
    expect(screen.getByText("2 people selected")).toBeTruthy();
  });
});
