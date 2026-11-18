import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import { SELECTED_CONTACTS_STORAGE_KEY } from "@/lib/crm/segment";
import { ASSIGN_CONTACTS_STORAGE_KEY } from "@/lib/crm/assignment";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

const push = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }));

function person(n: number): ContactRow {
  return {
    id: `c${n}`, fullName: `Person ${n}`, email: `person${n}@example.com`, phoneE164: `+9230000${String(n).padStart(5, "0")}`,
    country: "Pakistan", discoverySource: "sheet", purchaseCount: 0, productLabels: [], unsubscribed: false,
  };
}
const rows = Array.from({ length: 50 }, (_, i) => person(i));
const okJson = (body: unknown) => ({ ok: true, json: async () => body });
let conversionCalls: unknown[];

beforeEach(() => {
  push.mockReset(); toastError.mockReset(); toastSuccess.mockReset();
  sessionStorage.clear();
  conversionCalls = [];
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/admin/crm/manual-conversions") {
      conversionCalls.push(JSON.parse(String(init?.body)));
      return okJson({ count: 2 });
    }
    if (url.pathname.endsWith("/field-values")) return okJson({ values: [] });
    if (url.pathname.endsWith("/import/batches")) return okJson({ batches: [] });
    return okJson({ courses: [{ id: "course1", title: "Course One" }] });
  }));
});

function mount() { return render(<ContactsPanel initialRows={rows} initialTotal={50} />); }
function pick(n: number) { for (let i = 0; i < n; i++) fireEvent.click(screen.getByLabelText(`Select Person ${i}`)); }
function openMore() { fireEvent.click(screen.getByRole("button", { name: "More" })); }

describe("What do you want to do area", () => {
  it("with no picks shows the hint and no buttons", () => {
    mount();
    expect(screen.getByRole("heading", { name: "3 What do you want to do?" })).toBeTruthy();
    expect(screen.getByText("Tick people to see what you can do")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send an email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("shows the count, singular and plural, with Send an email and More", () => {
    mount();
    pick(1);
    expect(screen.getByText("1 person selected")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Select Person 1"));
    fireEvent.click(screen.getByLabelText("Select Person 2"));
    expect(screen.getByText("3 people selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send an email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("Send an email hands off the ids and goes to campaigns", () => {
    mount(); pick(2);
    fireEvent.click(screen.getByRole("button", { name: "Send an email" }));
    expect(JSON.parse(sessionStorage.getItem(SELECTED_CONTACTS_STORAGE_KEY)!)).toEqual(["c0", "c1"]);
    expect(push).toHaveBeenCalledWith("/dashboard/admin/sales-hub/campaigns");
  });

  it("More lists the three actions; Escape closes and returns focus to More", () => {
    mount(); pick(1);
    openMore();
    expect(screen.getByRole("menuitem", { name: "Send on WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Give to a sales agent" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Mark as converted" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("opening More moves focus to the first item and arrows move between items", () => {
    mount(); pick(1); openMore();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Send on WhatsApp" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Give to a sales agent" }));
  });

  it("WhatsApp hands off and goes to whatsapp", () => {
    mount(); pick(2); openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Send on WhatsApp" }));
    expect(JSON.parse(sessionStorage.getItem(SELECTED_CONTACTS_STORAGE_KEY)!)).toEqual(["c0", "c1"]);
    expect(push).toHaveBeenCalledWith("/dashboard/admin/sales-hub/whatsapp");
  });

  it("Give to a sales agent writes the assign key and navigates", () => {
    mount(); pick(2); openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Give to a sales agent" }));
    expect(JSON.parse(sessionStorage.getItem(ASSIGN_CONTACTS_STORAGE_KEY)!)).toEqual(["c0", "c1"]);
    expect(push).toHaveBeenCalledWith("/dashboard/admin/sales-hub/assign");
  });

  it("a sessionStorage failure shows the hand-off toast and does not navigate", () => {
    mount(); pick(1);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    fireEvent.click(screen.getByRole("button", { name: "Send an email" }));
    spy.mockRestore();
    expect(toastError).toHaveBeenCalledWith("Could not hand off the selection — try again.");
    expect(push).not.toHaveBeenCalled();
  });

  it("Mark as converted opens the form; Cancel closes it and focuses More", () => {
    mount(); pick(1); openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as converted" }));
    expect(screen.getByLabelText("Existing course")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Existing course")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("Escape closes the converted form and focuses More", () => {
    mount(); pick(1); openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as converted" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Mark as converted" }), { key: "Escape" });
    expect(screen.queryByLabelText("Existing course")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("Mark as converted still posts the same call and clears picks", async () => {
    mount(); pick(2); openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as converted" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Course One" })).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "Course to mark" }), { target: { value: "course1" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark 2 converted" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Marked 2 contacts converted."));
    expect(conversionCalls[0]).toMatchObject({ contactIds: ["c0", "c1"], program: { kind: "course", courseId: "course1" } });
    expect(screen.getByText("Tick people to see what you can do")).toBeTruthy();
  });

  it("Clear empties the picks", () => {
    mount(); pick(2);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Tick people to see what you can do")).toBeTruthy();
  });
});
