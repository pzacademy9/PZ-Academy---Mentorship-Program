import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { AffiliatePage } from "@/components/affiliates/AffiliatePage";
import type { AffiliatePageModel } from "@/lib/data/affiliate-page";

type ClientModel = Omit<AffiliatePageModel, "affiliateId">;

const model = (over: Partial<ClientModel> = {}): ClientModel => ({
  name: "Sara Khan", code: "SK321", team: null, percent: 8, automatic: false, paidCount: 3, monthPaid: 3, lastMonthPaid: 0, toNextStep: null,
  earnedPkr: 9000, balancePkr: 4120, waiting: [],
  totals: { views: 1, registered: 1, paid: 1 },
  links: [],
  supportWa: "https://wa.me/923155614490",
  rank: { all: null, month: null, boardUrl: "" },
  payout: { minimum: 3500, canRequest: true, pendingPkr: null, history: [] },
  ...over,
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Request payout of PKR 4,120" }));
  return screen.getByRole("dialog");
}
function fill(dialog: HTMLElement, title = "Sara Khan", number = "03001234567") {
  fireEvent.change(within(dialog).getByLabelText("Account title"), { target: { value: title } });
  fireEvent.change(within(dialog).getByLabelText("Account number or IBAN"), { target: { value: number } });
}

describe("payout balance card", () => {
  it("under the minimum: balance, progress, a disabled button and when it opens", () => {
    render(<AffiliatePage token="tok" model={model({ balancePkr: 1850, payout: { minimum: 3500, canRequest: false, pendingPkr: null, history: [] } })} />);
    expect(screen.getByTestId("balance").textContent).toContain("PKR 1,850");
    const button = screen.getByRole("button", { name: "Request payout" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Available from PKR 3,500")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /payout/i }).getAttribute("aria-valuenow")).toBe("1850");
  });
  it("ready: an enabled button with the amount", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    const button = screen.getByRole("button", { name: "Request payout of PKR 4,120" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
  it("keeps fractions on the button", () => {
    render(<AffiliatePage token="tok" model={model({ balancePkr: 4120.75 })} />);
    expect(screen.getByRole("button", { name: "Request payout of PKR 4,120.75" })).toBeTruthy();
  });
  it("pending: balance 0, a calm note, no request button", () => {
    render(<AffiliatePage token="tok" model={model({ balancePkr: 0, payout: { minimum: 3500, canRequest: false, pendingPkr: 4120, history: [] } })} />);
    expect(screen.getByTestId("balance").textContent).toContain("PKR 0");
    expect(screen.getByText("Payout of PKR 4,120 requested")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /request payout/i })).toBeNull();
  });
  it("uses no promises, cheers or exclamation marks", () => {
    const { container } = render(<AffiliatePage token="tok" model={model()} />);
    expect(container.textContent).not.toMatch(/!|24|48|instant|threshold|tier|raast/i);
  });
});

describe("payout sheet", () => {
  it("opens a number keyboard for wallets and a text keyboard for Bank", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    const input = within(dialog).getByLabelText("Account number or IBAN");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Bank/ }));
    expect(within(dialog).getByLabelText("Account number or IBAN").getAttribute("inputmode")).toBe("text");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Easypaisa/ }));
    expect(within(dialog).getByLabelText("Account number or IBAN").getAttribute("inputmode")).toBe("numeric");
  });
  it("shows three methods, two labelled boxes, the one-go line and Confirm", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    expect(within(dialog).getByRole("heading", { name: "Request payout of PKR 4,120" })).toBeTruthy();
    for (const name of ["JazzCash", "Easypaisa", "Bank"]) expect(within(dialog).getByRole("radio", { name: new RegExp("^" + name) })).toBeTruthy();
    expect(within(dialog).getByLabelText("Account title")).toBeTruthy();
    expect(within(dialog).getByLabelText("Account number or IBAN")).toBeTruthy();
    expect(within(dialog).getByText("The whole balance is paid in one go")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toBeTruthy();
  });
  it("moves focus into the sheet and closes on Escape", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("posts once even when Confirm is tapped twice, then shows the pending state", async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog);
    const confirm = within(dialog).getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/affiliates/payout");
    expect(JSON.parse(init.body)).toEqual({ token: "tok", method: "jazzcash", title: "Sara Khan", number: "03001234567" });
    resolve({ ok: true, json: async () => ({ ok: true, amountPkr: 4120 }) });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Payout of PKR 4,120 requested")).toBeTruthy();
    expect(screen.getByTestId("balance").textContent).toContain("PKR 0");
    expect(screen.queryByRole("button", { name: /request payout/i })).toBeNull();
  });
  it("shows the method and the masked account on the new history row, never the full number", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, amountPkr: 4120 }) });
    const { container } = render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog, "Sara Khan", "03001234567");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const row = await screen.findByTestId("payout-just-requested");
    expect(row.textContent).toContain("JazzCash");
    expect(row.textContent).toContain("•••• 4567");
    expect(row.textContent).toContain("Pending");
    expect(container.textContent).not.toContain("03001234567");
  });
  it("shows the server's error sentence in the sheet and lets the affiliate try again", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "You already have a payout request waiting." }) });
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(await within(dialog).findByText("You already have a payout request waiting.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("shows a 400 sentence too", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Account title must be 2 to 80 characters." }) });
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog, "S");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(await within(dialog).findByText("Account title must be 2 to 80 characters.")).toBeTruthy();
  });
  it("says so when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(await within(dialog).findByText("Could not reach the server. Please check your connection and try again.")).toBeTruthy();
  });
  it("catches a bad number before posting", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    const dialog = openSheet();
    fill(dialog, "Sara Khan", "123");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Enter an 11-digit mobile number starting with 03.")).toBeTruthy();
  });
});

describe("payout history", () => {
  const rows = [
    { id: "a", amountPkr: 4120, method: "jazzcash" as const, accountMask: "•••• 4567", status: "pending" as const, rejectReason: null, requestedAt: "2026-11-10T08:00:00Z", decidedAt: null },
    { id: "b", amountPkr: 3500, method: "bank" as const, accountMask: "•••• 9921", status: "paid" as const, rejectReason: null, requestedAt: "2026-10-02T08:00:00Z", decidedAt: "2026-10-03T08:00:00Z" },
    { id: "c", amountPkr: 4000.5, method: "easypaisa" as const, accountMask: "•••• 1111", status: "rejected" as const, rejectReason: "Account title did not match.", requestedAt: "2026-09-02T08:00:00Z", decidedAt: "2026-09-03T08:00:00Z" },
  ];
  it("lists each request with chip, mask and the rejection reason", () => {
    render(<AffiliatePage token="tok" model={model({ payout: { minimum: 3500, canRequest: true, pendingPkr: 4120, history: rows } })} />);
    expect(screen.getByRole("heading", { name: "Payout history" })).toBeTruthy();
    const a = screen.getByTestId("payout-a");
    expect(a.textContent).toContain("PKR 4,120");
    expect(a.textContent).toContain("JazzCash");
    expect(a.textContent).toContain("•••• 4567");
    expect(a.textContent).toContain("Pending");
    expect(screen.getByTestId("payout-b").textContent).toContain("Paid");
    expect(screen.getByTestId("payout-b").textContent).toContain("Bank");
    const c = screen.getByTestId("payout-c");
    expect(c.textContent).toContain("PKR 4,000.50");
    expect(c.textContent).toContain("Rejected");
    expect(c.textContent).toContain("Account title did not match.");
    expect(screen.queryByText(/\d{10,}/)).toBeNull();
  });
  it("shows no history block when there is none", () => {
    render(<AffiliatePage token="tok" model={model()} />);
    expect(screen.queryByRole("heading", { name: "Payout history" })).toBeNull();
  });
});
