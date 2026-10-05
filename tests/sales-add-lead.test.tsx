import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { AddLeadForm } from "@/components/sales/AddLeadForm";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const CHAT = "Name: Ayesha Tariq\nMy number is 0300 1234567\nayesha@example.com";

function mockLeads(status: number, body: unknown) {
  const f = vi.fn(async (_url?: string, _init?: { body: string }) => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
}
beforeEach(() => vi.unstubAllGlobals());

describe("AddLeadForm", () => {
  it("extracts details from a pasted chat and saves only filled fields", async () => {
    const f = mockLeads(201, { ok: true, contactId: "c1" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText(/paste the chat/i), { target: { value: CHAT } });
    fireEvent.click(screen.getByRole("button", { name: /read it/i }));
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Ayesha Tariq");
    expect((screen.getByLabelText("WhatsApp phone") as HTMLInputElement).value).toBe("+923001234567");
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    await waitFor(() => expect(screen.getByText(/saved to your contacts/i)).toBeTruthy());
    const body = JSON.parse(f.mock.calls[0][1]!.body);
    expect(body).toEqual({ phone: "+923001234567", name: "Ayesha Tariq", email: "ayesha@example.com" });
    expect(screen.getByRole("link", { name: "Go to Today" }).getAttribute("href")).toBe("/dashboard/sales");
  });

  it("a duplicate with an id links to the contact and names the owner", async () => {
    mockLeads(409, { error: "This person is already in the CRM.", reason: "duplicate", contactId: "c9", ownerName: "Hina" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "03001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText(/Hina already has this person/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open contact" }).getAttribute("href")).toBe("/dashboard/sales/contacts?tab=all&open=c9");
  });

  it("a duplicate without an id shows no link", async () => {
    mockLeads(409, { error: "This person is already in the CRM.", reason: "duplicate", contactId: null, ownerName: null });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "03001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText(/already in the CRM/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open contact" })).toBeNull();
  });

  it("shows the server's phone error inline", async () => {
    mockLeads(400, { error: "Enter a valid phone number (e.g. 03001234567).", reason: "invalid-phone" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText("Enter a valid phone number (e.g. 03001234567).")).toBeTruthy();
  });

  it("save stays disabled without a phone", () => {
    render(<AddLeadForm />);
    expect((screen.getByRole("button", { name: "Save to My Contacts" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a network failure shows plain copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "03001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText(/could not save this lead/i)).toBeTruthy();
  });

  it("says so when no phone is found in the chat", () => {
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText(/paste the chat/i), { target: { value: "hello there" } });
    fireEvent.click(screen.getByRole("button", { name: /read it/i }));
    expect(screen.getByText(/could not find a phone number/i)).toBeTruthy();
  });
});
