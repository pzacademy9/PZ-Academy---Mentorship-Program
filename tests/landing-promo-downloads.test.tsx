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

describe("PromoDownloads", () => {
  it("shows all three buttons for people-permitted admins", () => {
    render(<PromoDownloads {...props} />);
    expect(screen.getByRole("button", { name: "Ordinary codes (PDF)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sales agent codes (PDF)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Affiliate codes (PDF)" })).toBeTruthy();
  });
  it("hides the people buttons without permission", () => {
    render(<PromoDownloads {...props} canDownloadPeople={false} />);
    expect(screen.getByRole("button", { name: "Ordinary codes (PDF)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sales agent codes (PDF)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Affiliate codes (PDF)" })).toBeNull();
  });
  it("downloads ordinary codes straight away", async () => {
    render(<PromoDownloads {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ordinary codes (PDF)" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatch(/^pz-promo-codes-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(spec().rows.map((r) => r[0])).toEqual(["PZ10"]);
  });
  it("asks who will see the agent file, then saves the share version", async () => {
    render(<PromoDownloads {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Sales agent codes (PDF)" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Affiliate codes (PDF)" }));
    fireEvent.click(await screen.findByRole("button", { name: /For me/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatch(/^pz-affiliate-codes-/);
    expect(spec().rows[0]).toEqual(["Sara", "SARA-1", "10% off plain", "On"]);
  });
  it("Escape closes the dialog and focus returns to the button", async () => {
    render(<PromoDownloads {...props} />);
    const btn = screen.getByRole("button", { name: "Sales agent codes (PDF)" });
    btn.focus();
    fireEvent.click(btn);
    await screen.findByText("Who will see this file?");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Who will see this file?")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(btn));
    expect(save).not.toHaveBeenCalled();
  });
  it("tells the owner when there are no codes for the file", async () => {
    render(<PromoDownloads {...props} codes={[code({ id: "9", code: "OFF", active: false })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ordinary codes (PDF)" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("There are no codes to put in this file."));
    expect(save).not.toHaveBeenCalled();
  });
  it("shows a busy state while the file is made", async () => {
    render(<PromoDownloads {...props} />);
    const btn = screen.getByRole("button", { name: "Ordinary codes (PDF)" });
    fireEvent.click(btn);
    const busy = screen.getByRole("button", { name: /Making the file/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Ordinary codes (PDF)" }).getAttribute("aria-busy")).toBeNull());
  });
});
