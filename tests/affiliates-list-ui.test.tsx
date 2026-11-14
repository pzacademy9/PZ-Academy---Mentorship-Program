import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { AffiliatesList } from "@/components/admin/affiliates/AffiliatesList";
import type { AffiliateRow } from "@/lib/data/affiliates";
import type { AffiliateTemplate } from "@/lib/data/affiliate-templates";

const base: AffiliateRow = {
  id: "a1", status: "accepted", name: "Sara Khan", email: "sara@example.com", whatsapp: "0300 1234567",
  cityCountry: "Lahore, Pakistan", answers: {}, code: "SK321", team: "Blue", commissionMode: "automatic", manualPercent: null,
  openingSecured: 0, openingCommission: 0, openingWithdrawn: 0, isImported: false, termsAcceptedAt: null, termsVersion: null,
  acceptedAt: "2026-11-02T00:00:00Z", droppedAt: null, dropReason: null, leftAt: null, createdAt: "2026-11-01T00:00:00Z",
};
const bilal: AffiliateRow = { ...base, id: "a2", name: "Bilal Ahmed", email: "bilal@mail.org", code: "BA777", whatsapp: "0300 1111222" };
const noNum: AffiliateRow = { ...base, id: "a3", name: "Zed Short", email: "zed@mail.org", code: "ZS1", whatsapp: "12345" };

const wa = (id: string, name: string, body: string): AffiliateTemplate => ({ id, channel: "whatsapp", name, subject: null, body });
const templates = {
  whatsapp: [wa("w1", "Welcome", "Hello {name}, your code is {code}."), wa("w2", "Thanks", "Thank you {name} ({code}).")],
  email: [{ id: "e1", channel: "email" as const, name: "Email hello", subject: "Hi {name}", body: "Body for {name}, code {code}." }],
};

const open = vi.fn();
const onOpen = vi.fn();
beforeEach(() => {
  open.mockReset();
  onOpen.mockReset();
  vi.stubGlobal("open", open);
});

const rows = [base, bilal];
const renderList = (over: Partial<Parameters<typeof AffiliatesList>[0]> = {}) =>
  render(<AffiliatesList rows={rows} templates={templates} onOpen={onOpen} {...over} />);

describe("AffiliatesList search", () => {
  it("filters by name, code and email", () => {
    renderList();
    const box = screen.getByPlaceholderText("Search name, code or email");
    fireEvent.change(box, { target: { value: "bilal" } });
    expect(screen.queryByText("Sara Khan")).toBeNull();
    expect(screen.getByText("Bilal Ahmed")).toBeTruthy();
    fireEvent.change(box, { target: { value: "sk321" } });
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.queryByText("Bilal Ahmed")).toBeNull();
    fireEvent.change(box, { target: { value: "mail.org" } });
    expect(screen.getByText("Bilal Ahmed")).toBeTruthy();
  });
  it("shows the empty state and Reset search brings everyone back", () => {
    renderList();
    fireEvent.change(screen.getByPlaceholderText("Search name, code or email"), { target: { value: "zzzz" } });
    expect(screen.getByText("No one matches your search")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset search" }));
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.getByText("Bilal Ahmed")).toBeTruthy();
  });
});

describe("AffiliatesList message picker", () => {
  const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

  it("WhatsApp lists only WhatsApp templates, filled with name and code", () => {
    renderList();
    fireEvent.click(within(row("Sara Khan")).getByRole("button", { name: "WhatsApp" }));
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Choose a message")).toBeTruthy();
    expect(d.getByRole("radio", { name: /Welcome/ })).toBeTruthy();
    expect(d.getByRole("radio", { name: /Thanks/ })).toBeTruthy();
    expect(d.queryByRole("radio", { name: /Email hello/ })).toBeNull();
    fireEvent.click(d.getByRole("radio", { name: /Thanks/ }));
    expect((d.getByLabelText(/Message text/) as HTMLTextAreaElement).value).toBe("Thank you Sara Khan (SK321).");
  });

  it("opens WhatsApp with the edited text in a new tab", () => {
    renderList();
    fireEvent.click(within(row("Sara Khan")).getByRole("button", { name: "WhatsApp" }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.change(d.getByLabelText(/Message text/), { target: { value: "My own words" } });
    fireEvent.click(d.getByRole("button", { name: "Open WhatsApp" }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0] as [string, string, string];
    expect(url).toBe("https://wa.me/923001234567?text=My%20own%20words");
    expect(target).toBe("_blank");
    expect(features).toContain("noopener");
  });

  it("Email lists only email templates and builds a mailto with the subject", () => {
    const loc = { href: "" };
    vi.stubGlobal("location", loc);
    renderList();
    fireEvent.click(within(row("Sara Khan")).getByRole("button", { name: "Email" }));
    const d = within(screen.getByRole("dialog"));
    expect(d.getByRole("radio", { name: /Email hello/ })).toBeTruthy();
    expect(d.queryByRole("radio", { name: /Welcome/ })).toBeNull();
    expect((d.getByLabelText("Subject") as HTMLInputElement).value).toBe("Hi Sara Khan");
    fireEvent.click(d.getByRole("button", { name: "Open email" }));
    expect(loc.href).toBe("mailto:sara@example.com?subject=Hi%20Sara%20Khan&body=Body%20for%20Sara%20Khan%2C%20code%20SK321.");
    vi.unstubAllGlobals();
  });

  it("a number under 8 digits disables WhatsApp with No valid number", () => {
    renderList({ rows: [noNum] });
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    const b = within(screen.getByRole("dialog")).getByRole("button", { name: "No valid number" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(open).not.toHaveBeenCalled();
  });

  it("when templates failed, says so and the row still works", () => {
    renderList({ templates: null, templatesFailed: true });
    fireEvent.click(within(row("Sara Khan")).getByRole("button", { name: "WhatsApp" }));
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Messages could not be loaded.")).toBeTruthy();
    fireEvent.change(d.getByLabelText(/Message text/), { target: { value: "Typed by hand" } });
    fireEvent.click(d.getByRole("button", { name: "Open WhatsApp" }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("AffiliatesList opening the detail", () => {
  it("tapping the card body opens the detail", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Sara Khan/ }));
    expect(onOpen).toHaveBeenCalledWith("a1");
  });
  it("tapping a toolbar button does not", () => {
    renderList();
    const li = screen.getByText("Sara Khan").closest("li") as HTMLElement;
    fireEvent.click(within(li).getByRole("button", { name: "WhatsApp" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(li).getByRole("button", { name: "Email" }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
