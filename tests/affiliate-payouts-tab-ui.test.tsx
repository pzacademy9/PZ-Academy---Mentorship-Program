import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AffiliatePayoutsTab } from "@/components/admin/affiliates/AffiliatePayoutsTab";
import type { PayoutRow } from "@/lib/data/affiliate-payouts";

const row = (over: Partial<PayoutRow> = {}): PayoutRow => ({
  id: "p1", affiliateId: "a1", affiliateName: "Sara Khan", affiliateCode: "SK321", amountPkr: 4120.75, method: "jazzcash",
  accountTitle: "Sara K", accountNumber: "03001234567", status: "pending", rejectReason: null,
  requestedAt: "2026-11-10T10:00:00Z", decidedAt: null, ...over,
});
const rows = [
  row(),
  row({ id: "p2", affiliateId: "a2", affiliateName: "Omar Ali", affiliateCode: "OA100", amountPkr: 5000, status: "pending" }),
  row({ id: "p3", affiliateId: "a3", affiliateName: "Hina Shah", affiliateCode: "HS200", amountPkr: 3500, status: "paid", decidedAt: "2026-11-12T10:00:00Z" }),
  row({ id: "p4", affiliateId: "a4", affiliateName: "Zed Noor", affiliateCode: "ZN300", amountPkr: 3600, status: "rejected", rejectReason: "Wrong account number", decidedAt: "2026-11-12T10:00:00Z" }),
];

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("AffiliatePayoutsTab", () => {
  it("shows filter chips with counts and defaults to Pending", () => {
    render(<AffiliatePayoutsTab initial={rows} failed={false} />);
    expect(screen.getByRole("button", { name: "Pending (2)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Paid (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejected (1)" })).toBeTruthy();
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.queryByText("Hina Shah")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paid (1)" }));
    expect(screen.getByText("Hina Shah")).toBeTruthy();
    expect(screen.queryByText("Sara Khan")).toBeNull();
  });

  it("shows the exact amount, including cents, and a plain pending total", () => {
    render(<AffiliatePayoutsTab initial={rows} failed={false} />);
    expect(screen.getAllByText("PKR 4,120.75").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 requests waiting/)).toBeTruthy();
    expect(screen.getByText(/PKR 9,120.75/)).toBeTruthy();
  });

  it("searches by name and by code", () => {
    render(<AffiliatePayoutsTab initial={rows} failed={false} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "omar" } });
    expect(screen.getByText("Omar Ali")).toBeTruthy();
    expect(screen.queryByText("Sara Khan")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "sk321" } });
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.queryByText("Omar Ali")).toBeNull();
  });

  it("shows the affiliate name beside the account title and a copy button for the number", async () => {
    render(<AffiliatePayoutsTab initial={[row()]} failed={false} />);
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.getByText(/Account title/).textContent).toContain("Sara K");
    expect(screen.getByText("03001234567")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy account number" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("03001234567"));
  });

  it("Mark paid moves the card to Paid without a reload", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, emailSent: true }));
    render(<AffiliatePayoutsTab initial={[row()]} failed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Paid (1)" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Pending (0)" })).toBeTruthy();
    const call = fetchMock().mock.calls[0];
    expect(call[0]).toBe("/api/admin/affiliates/payouts/p1");
    expect(call[1].method).toBe("PATCH");
    expect(JSON.parse(call[1].body)).toEqual({ action: "paid" });
    expect(toast.success).toHaveBeenCalledWith("Marked as paid. The affiliate has been emailed.");
  });

  it("says the email could not be sent but keeps the decision", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, emailSent: false }));
    render(<AffiliatePayoutsTab initial={[row()]} failed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved. The email could not be sent."));
    expect(screen.getByRole("button", { name: "Paid (1)" })).toBeTruthy();
  });

  it("Reject opens a form that disables Confirm until a reason is typed, with quick-reason chips", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, emailSent: true }));
    render(<AffiliatePayoutsTab initial={[row()]} failed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dlg = within(screen.getByRole("dialog"));
    const confirm = dlg.getByRole("button", { name: "Confirm reject" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(dlg.getByRole("button", { name: "Account title does not match the name" })).toBeTruthy();
    expect(dlg.getByRole("button", { name: "Wrong account number" })).toBeTruthy();
    fireEvent.click(dlg.getByRole("button", { name: "Wrong account number" }));
    expect((dlg.getByLabelText("Reason for the affiliate") as HTMLTextAreaElement).value).toBe("Wrong account number");
    expect(confirm.disabled).toBe(false);
    fireEvent.change(dlg.getByLabelText("Reason for the affiliate"), { target: { value: "  " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(dlg.getByLabelText("Reason for the affiliate"), { target: { value: "Number is not active" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("button", { name: "Rejected (1)" })).toBeTruthy());
    expect(JSON.parse(fetchMock().mock.calls[0][1].body)).toEqual({ action: "reject", reason: "Number is not active" });
  });

  it("shows a server error and leaves the card where it was", async () => {
    fetchMock().mockResolvedValue(reply(409, { error: "This payout was already decided." }));
    render(<AffiliatePayoutsTab initial={[row()]} failed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This payout was already decided."));
    expect(screen.getByRole("button", { name: "Pending (1)" })).toBeTruthy();
  });

  it("paid cards show the paid date and rejected cards show the reason", () => {
    render(<AffiliatePayoutsTab initial={rows} failed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Paid (1)" }));
    expect(screen.getByText(/Paid on 12 Nov 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rejected (1)" }));
    expect(screen.getByText("Wrong account number")).toBeTruthy();
  });

  it("shows a Could not load notice on a load failure", () => {
    render(<AffiliatePayoutsTab initial={[]} failed />);
    expect(screen.getByText(/Could not load/)).toBeTruthy();
  });

  it("leaves out the things we do not have", () => {
    const { container } = render(<AffiliatePayoutsTab initial={rows} failed={false} />);
    expect(container.textContent).not.toMatch(/Bulk|CSV|CNIC|Live Gateway|SMS|Batch/i);
  });
});
