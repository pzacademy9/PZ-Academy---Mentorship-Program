import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LABEL = "Complete Course — Module 1 — Individual — PKR 1,960";

function person(n: number, over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: `c${n}`, fullName: `Person ${n}`, email: `person${n}@example.com`, phoneE164: `+9230000${String(n).padStart(5, "0")}`,
    country: "Pakistan", discoverySource: "sheet", purchaseCount: 0, productLabels: [], unsubscribed: false, ...over,
  };
}
function page(offset: number, count = 50): ContactRow[] {
  return Array.from({ length: count }, (_, i) => person(offset + i));
}

type Handler = (url: URL) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
let contactsHandler: Handler;
let contactsCalls: URL[];

const okJson = (body: unknown) => ({ ok: true, json: async () => body });

function defaultHandler(total = 2111): Handler {
  return async (url) => {
    const offset = Number(url.searchParams.get("offset"));
    return okJson({ rows: page(offset, Math.min(50, total - offset)), total });
  };
}

beforeEach(() => {
  contactsCalls = [];
  contactsHandler = defaultHandler();
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/admin/crm/contacts") {
      contactsCalls.push(url);
      return contactsHandler(url);
    }
    if (url.pathname.endsWith("/field-values")) return okJson({ values: [LABEL] });
    if (url.pathname.endsWith("/import/batches")) return okJson({ batches: [{ id: "b1", sheetName: "Sheet", tabName: "Tab", rowsImported: 10 }] });
    return okJson({ courses: [] });
  }));
});

function mount(rows: ContactRow[] = page(0), total = 2111) {
  return render(<ContactsPanel initialRows={rows} initialTotal={total} />);
}

describe("Contacts find people + list", () => {
  it("renders step 1 with search, Course and Class group", () => {
    mount();
    expect(screen.getByRole("heading", { name: "1 Find people" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Search name, email, or phone/)).toBeTruthy();
    expect(screen.getByLabelText("Course")).toBeTruthy();
    expect(screen.getByLabelText("Class group")).toBeTruthy();
  });

  it("pages forward with offset=50 and updates the showing line", async () => {
    mount();
    expect(screen.getByText("Showing 1 to 50 of 2,111 people")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");
    expect(contactsCalls[0].searchParams.get("offset")).toBe("50");
    expect(contactsCalls[0].searchParams.get("limit")).toBe("50");
  });

  it("disables Previous on page 1 and Next on the last page", async () => {
    contactsHandler = defaultHandler(60);
    mount(page(0), 60);
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 60 of 60 people");
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a search or filter change fetches offset=0 and resets to page 1", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");

    fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: "ab" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Search name/), { key: "Enter" });
    await screen.findByText("Showing 1 to 50 of 2,111 people");
    const searchCall = contactsCalls[contactsCalls.length - 1];
    expect(searchCall.searchParams.get("offset")).toBe("0");
    expect(searchCall.searchParams.get("search")).toBe("ab");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");
    const course = courseNameFromLabel(LABEL);
    await screen.findByRole("option", { name: course });
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: course } });
    await screen.findByText("Showing 1 to 50 of 2,111 people");
    const filterCall = contactsCalls[contactsCalls.length - 1];
    expect(filterCall.searchParams.get("offset")).toBe("0");
    expect(filterCall.searchParams.get("courseName")).toBe(course);
    expect(filterCall.searchParams.get("search")).toBe("ab");
  });

  it("keeps ticks across Next and back", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("Select Person 0"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Showing 1 to 50 of 2,111 people");
    expect((screen.getByLabelText("Select Person 0") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("Select all shown ticks only the current page", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("Select all shown"));
    expect(screen.getByText("50 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");
    expect((screen.getByLabelText("Select all shown") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Select Person 50") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Select all shown"));
    expect(screen.getByText("100 selected")).toBeTruthy();
  });

  it("an older answer arriving last does not replace newer rows", async () => {
    mount();
    const pending: Array<(v: ReturnType<typeof okJson>) => void> = [];
    contactsHandler = () => new Promise((resolve) => { pending.push(resolve); });
    const box = screen.getByPlaceholderText(/Search name/);
    fireEvent.change(box, { target: { value: "a" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "ab" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(pending).toHaveLength(2);
    pending[1](okJson({ rows: [person(900, { fullName: "Newer Person" })], total: 1 }));
    await screen.findByText("Newer Person");
    pending[0](okJson({ rows: [person(901, { fullName: "Older Person" })], total: 1 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Older Person")).toBeNull();
    expect(screen.getByText("Newer Person")).toBeTruthy();
  });

  it("a failed request shows an alert with Try again and keeps old rows", async () => {
    mount();
    contactsHandler = async () => ({ ok: false, json: async () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toBeTruthy();
    expect(screen.getByText("Person 0")).toBeTruthy();
    contactsHandler = defaultHandler();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByText("Showing 51 to 100 of 2,111 people");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads clearly for a person with no name and no phone, and shows Unsubscribed", () => {
    const { container } = mount([person(1, { fullName: "", phoneE164: null, unsubscribed: true })], 1);
    expect(screen.getByText("Name not given")).toBeTruthy();
    expect(screen.getByText("Phone needs review")).toBeTruthy();
    expect(screen.getByText("Unsubscribed")).toBeTruthy();
    expect(container.textContent).not.toContain("undefined");
  });

  it("links each person to the detail page", () => {
    mount([person(7)], 1);
    expect(screen.getByRole("link", { name: "Person 7" }).getAttribute("href")).toBe("/dashboard/admin/sales-hub/contacts/c7");
  });

  it("shows course names once each", () => {
    const other = "Complete Course — Module 1 — Individual — PKR 2,500";
    mount([person(1, { productLabels: [LABEL, other] })], 1);
    expect(screen.getAllByText(courseNameFromLabel(LABEL))).toHaveLength(1);
  });

  it("explains an empty filtered list and an empty unfiltered one", async () => {
    mount([], 0);
    expect(screen.getByText("No contacts yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Import contacts" })).toBeTruthy();
    contactsHandler = async () => okJson({ rows: [], total: 0 });
    const box = screen.getByPlaceholderText(/Search name/);
    fireEvent.change(box, { target: { value: "zzz" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByText("No one matches. Try a shorter search.");
  });

  it("jumps to the last page that exists when the total shrinks", async () => {
    mount();
    contactsHandler = async (url) => {
      const offset = Number(url.searchParams.get("offset"));
      return okJson({ rows: offset === 0 ? page(0, 20) : [], total: 20 });
    };
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 1 to 20 of 20 people");
    await waitFor(() => expect(contactsCalls[contactsCalls.length - 1].searchParams.get("offset")).toBe("0"));
  });
});
