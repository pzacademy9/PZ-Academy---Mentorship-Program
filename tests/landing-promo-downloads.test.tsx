import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/landing/registration/promo-pdf", async () => {
  const real = await vi.importActual<typeof import("@/lib/landing/registration/promo-pdf")>("@/lib/landing/registration/promo-pdf");
  return {
    ...real,
    renderPromoPdf: (spec: unknown) => {
      (globalThis as { __spec?: unknown }).__spec = spec;
      return { save };
    },
  };
});

import { PromoDownloads } from "@/components/admin/landing/promo/PromoDownloads";
import type { PromoCode } from "@/lib/landing/registration/promo";

function code(over: Partial<PromoCode>): PromoCode {
  return {
    id: "x", code: "X", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
    maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null,
    ownerAffiliateId: null, isOwnerCode: false, ...over,
  };
}
const codes = [
  code({ id: "1", code: "PZ10" }),
  code({ id: "2", code: "ALI-1", isOwnerCode: true, ownerAgentId: "a1" }),
  code({ id: "3", code: "SARA-1", isOwnerCode: true, ownerAffiliateId: "f1" }),
];
const agents = [{ id: "a1", name: "Ali" }];
const affiliates = [{ id: "f1", name: "Sara" }];
const props = { codes, pages: [], agents, affiliates, canDownloadPeople: true };
const spec = () => (globalThis as unknown as { __spec: { rows: string[][]; columns: { label: string }[] } }).__spec;

beforeEach(() => { save.mockReset(); toast.error.mockReset(); });

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Download PDF" });
  trigger.focus();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return trigger;
}
const item = (name: string) => screen.findByRole("menuitem", { name });

describe("PromoDownloads", () => {
  it("shows only the one button until it is clicked", () => {
    render(<PromoDownloads {...props} />);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.queryByText("Download as PDF")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ordinary codes/ })).toBeNull();
  });
  it("lists the three items for people-permitted admins", async () => {
    render(<PromoDownloads {...props} />);
    openMenu();
    expect(await item("Ordinary codes")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sales agent codes" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Affiliate codes" })).toBeTruthy();
  });
  it("lists two items without permission", async () => {
    render(<PromoDownloads {...props} canDownloadPeople={false} />);
    openMenu();
    expect(await item("Ordinary codes")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Sales agent codes" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Affiliate codes" })).toBeNull();
  });
  it("downloads ordinary codes straight away", async () => {
    render(<PromoDownloads {...props} />);
    openMenu();
    fireEvent.click(await item("Ordinary codes"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatch(/^pz-promo-codes-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(spec().rows.map((r) => r[0])).toEqual(["PZ10"]);
  });
  it("asks who will see the agent file, then saves the share version", async () => {
    render(<PromoDownloads {...props} />);
    openMenu();
    fireEvent.click(await item("Sales agent codes"));
    expect(await screen.findByText("Who will see this file?")).toBeTruthy();
    expect(screen.getByText("Shows name and code only.")).toBeTruthy();
    expect(screen.getByText("Also shows the discount and whether the code is on.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Share in a group/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatch(/^pz-agent-codes-/);
    expect(spec().rows).toEqual([["Ali", "ALI-1"]]);
  });
  it("saves the me version for affiliates", async () => {
    render(<PromoDownloads {...props} />);
    openMenu();
    fireEvent.click(await item("Affiliate codes"));
    fireEvent.click(await screen.findByRole("button", { name: /For me/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatch(/^pz-affiliate-codes-/);
    expect(spec().rows[0]).toEqual(["Sara", "SARA-1", "10% off plain", "On"]);
  });
  it("Escape closes the dialog and focus returns to Download PDF", async () => {
    render(<PromoDownloads {...props} />);
    const btn = openMenu();
    fireEvent.click(await item("Sales agent codes"));
    await screen.findByText("Who will see this file?");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Who will see this file?")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(btn));
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(save).not.toHaveBeenCalled();
  });
  it("Escape closes the open menu and focus returns to Download PDF", async () => {
    render(<PromoDownloads {...props} />);
    const btn = openMenu();
    const first = await item("Ordinary codes");
    fireEvent.keyDown(first, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(btn));
    expect(save).not.toHaveBeenCalled();
  });
  it("tells the owner when there are no codes for the file", async () => {
    render(<PromoDownloads {...props} codes={[code({ id: "9", code: "OFF", active: false })]} />);
    openMenu();
    fireEvent.click(await item("Ordinary codes"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("There are no codes to put in this file."));
    expect(save).not.toHaveBeenCalled();
  });
  it("is busy and disabled while the file is made, and a second pick does nothing", async () => {
    render(<PromoDownloads {...props} />);
    openMenu();
    fireEvent.click(await item("Ordinary codes"));
    const busy = screen.getByRole("button", { name: /Making the file/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    fireEvent.pointerDown(busy, { button: 0, ctrlKey: false });
    fireEvent.keyDown(busy, { key: "Enter" });
    expect(screen.queryByRole("menuitem")).toBeNull();
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" }).getAttribute("aria-busy")).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
  });
});
