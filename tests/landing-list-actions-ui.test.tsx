// tests/landing-list-actions-ui.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";
import { RowActions } from "@/components/admin/registrations/RowActions";
import { StatusEmailDialog } from "@/components/admin/registrations/StatusEmailDialog";
import { EditDetailsDialog } from "@/components/admin/registrations/EditDetailsDialog";
import { VoucherThumb } from "@/components/admin/registrations/VoucherThumb";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const DRIVE = "https://drive.google.com/file/d/abc123/view";

const row = (over: Partial<RegistrationListRow> = {}): RegistrationListRow => ({
  id: "r1", refId: "PZA-1", name: "Zainab Qasim", email: "z@x.com", pageId: "pg1", pageTitle: "PPC Masterclass",
  optionLabel: "Full course", mode: "live", region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR",
  status: "pending", agentId: null, agentName: null, groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null,
  voucherUrl: null, whatsapp: "+923219876543", sheetUpdateWaiting: false, lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, ...over,
});

const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lastBody = (i = -1) => JSON.parse((fetchMock.mock.calls.at(i)![1] as { body: string }).body);

function openMenu(name = /Actions for Zainab Qasim/) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
}

describe("table hosts", () => {
  const tableProps = {
    total: 1, pageSize: 25, basePath: "/b", filters: {}, detailHrefBase: "/d", showAgentColumn: false,
  };
  it("shows no actions and no voucher when rowActions is not passed (sales list)", () => {
    render(<RegistrationsTable rows={[row({ voucherUrl: DRIVE })]} {...tableProps} />);
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
    expect(screen.queryByText("No voucher")).toBeNull();
    expect(screen.queryByText("View voucher")).toBeNull();
  });

  it("shows actions, voucher and the waiting tag in the admin list, desktop and mobile", () => {
    render(
      <RegistrationsTable
        rows={[row({ voucherUrl: DRIVE, sheetUpdateWaiting: true })]}
        {...tableProps}
        rowActions={(r) => <RowActions row={r} onOpenBuilder={() => {}} />}
      />,
    );
    const t = within(screen.getByRole("table"));
    expect(t.getByRole("button", { name: /Actions for Zainab Qasim/ })).toBeTruthy();
    expect(t.getByText("Sheet update waiting")).toBeTruthy();
    expect(t.getByRole("link", { name: /voucher/i }).getAttribute("href")).toBe(DRIVE);
    const cards = within(screen.getByTestId("responsive-cards"));
    expect(cards.getByRole("button", { name: /Actions for Zainab Qasim/ })).toBeTruthy();
    expect(cards.getByText("Sheet update waiting")).toBeTruthy();
    expect(cards.getByRole("link", { name: /View voucher/ }).getAttribute("href")).toBe(DRIVE);
  });
});

describe("voucher thumbnail", () => {
  it("renders the Drive thumbnail inside a safe new-tab link", () => {
    render(<VoucherThumb url={DRIVE} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(DRIVE);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.querySelector("img")!.getAttribute("src")).toBe("https://drive.google.com/thumbnail?id=abc123&sz=w160");
  });
  it("falls back to the document icon when the image fails", () => {
    render(<VoucherThumb url={DRIVE} />);
    fireEvent.error(screen.getByRole("link").querySelector("img")!);
    expect(screen.getByRole("link").querySelector("img")).toBeNull();
    expect(screen.getByRole("link").querySelector("svg")).toBeTruthy();
  });
  it("renders no img for a non-Drive link but still links to it", () => {
    render(<VoucherThumb url="https://example.com/slip.pdf" />);
    expect(screen.getByRole("link").querySelector("img")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/slip.pdf");
  });
  it("shows plain text, no link, for a non-https url", () => {
    const { container } = render(<VoucherThumb url="javascript:alert(1)" />);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Voucher")).toBeTruthy();
    cleanup();
    const card = render(<VoucherThumb url="javascript:alert(1)" variant="card" />);
    expect(card.container.querySelector("a")).toBeNull();
  });
  it("says No voucher when there is no link", () => {
    render(<VoucherThumb url={null} />);
    expect(screen.getByText("No voucher")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("row menu", () => {
  it("lists the four actions", () => {
    render(<RowActions row={row()} onOpenBuilder={() => {}} />);
    openMenu();
    for (const n of ["Edit details", "Status email", "Send email", "Send WhatsApp"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(n) })).toBeTruthy();
    }
  });

  it("opens the builder for just this person with this row's page", () => {
    const onOpen = vi.fn();
    render(<RowActions row={row({ pageId: "pgX", pageTitle: "Page X" })} onOpenBuilder={onOpen} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Send email/ }));
    expect(onOpen).toHaveBeenCalledWith("email", { pageId: "pgX", pageTitle: "Page X", selection: { mode: "ids", ids: ["r1"] }, count: 1 });
  });

  it("opens WhatsApp for a good number", () => {
    const onOpen = vi.fn();
    render(<RowActions row={row()} onOpenBuilder={onOpen} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Send WhatsApp/ }));
    expect(onOpen).toHaveBeenCalledWith("whatsapp", expect.objectContaining({ count: 1, selection: { mode: "ids", ids: ["r1"] } }));
  });

  it("disables WhatsApp with 'No phone number' for an empty number", () => {
    const onOpen = vi.fn();
    render(<RowActions row={row({ whatsapp: "" })} onOpenBuilder={onOpen} />);
    openMenu();
    const item = screen.getByRole("menuitem", { name: /Send WhatsApp/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(within(item).getByText("No phone number")).toBeTruthy();
    fireEvent.click(item);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("disables WhatsApp with 'Number not valid' for an invalid number", () => {
    render(<RowActions row={row({ whatsapp: "03" })} onOpenBuilder={() => {}} />);
    openMenu();
    const item = screen.getByRole("menuitem", { name: /Send WhatsApp/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(within(item).getByText("Number not valid")).toBeTruthy();
  });

  it("opens the edit and status dialogs from the menu", () => {
    render(<RowActions row={row()} onOpenBuilder={() => {}} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit details/ }));
    expect(screen.getByRole("dialog", { name: /Edit candidate details/ })).toBeTruthy();
  });
});

describe("status email dialog", () => {
  const open = (r = row(), rowType: "individual" | "lead" | "member" = "lead") =>
    render(<StatusEmailDialog row={r} rowType={rowType} onClose={() => {}} />);

  it("offers four kinds for a lead and two for a member", () => {
    open();
    expect(screen.getAllByRole("radio").map((x) => x.getAttribute("value"))).toEqual(["received", "paid", "underpaid", "reserved"]);
    cleanup();
    open(row(), "member");
    expect(screen.getAllByRole("radio").map((x) => x.getAttribute("value"))).toEqual(["received", "paid"]);
    expect(screen.getByLabelText(/Pending/)).toBeTruthy();
  });

  it("warns when the chosen email does not match the status", () => {
    open(row({ status: "pending" }));
    expect(screen.queryByText(/You picked/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Paid/ }));
    expect(screen.getByText("You picked the Paid email, but this person's status is Pending.")).toBeTruthy();
    expect(screen.getByText(/does not change the person's status/i)).toBeTruthy();
  });

  it("treats a free row as matching the Pending email", () => {
    open(row({ status: "free" }));
    expect((screen.getByRole("radio", { name: /Pending/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/You picked/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Paid/ }));
    expect(screen.getByText(/You picked the Paid email/)).toBeTruthy();
  });

  it("sends once without confirmation, then closes and refreshes", async () => {
    const onClose = vi.fn();
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true }));
    render(<StatusEmailDialog row={row()} rowType="lead" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/registrations/r1/status-email");
    expect(lastBody(0)).toEqual({ kind: "received" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the confirm step only after the server's 409, then re-posts with confirmedAgain", async () => {
    const onClose = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonRes(409, { error: "x", code: "needs-confirm", sentAt: "2026-10-14T06:20:00Z" }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    render(<StatusEmailDialog row={row()} rowType="lead" onClose={onClose} />);
    expect(screen.queryByText(/already got this email/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    expect(await screen.findByText(/This person already got this email on 14 Oct 2026, 11:20 am\. Send again\?/)).toBeTruthy();
    expect(lastBody(0)).toEqual({ kind: "received" });
    fireEvent.click(screen.getByRole("button", { name: "Send again anyway" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody(1)).toEqual({ kind: "received", confirmedAgain: true });
  });

  it("asks first, without posting, when this email was already sent", async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true }));
    render(<StatusEmailDialog row={row({ lastEmailAt: { received: "2026-10-14T06:20:00Z" } })} rowType="lead" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    expect(screen.getByText(/already got this email on 14 Oct 2026, 11:20 am/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send again anyway" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(0)).toEqual({ kind: "received", confirmedAgain: true });
  });

  it("disables the buttons while the request is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { finish = r; }));
    render(<StatusEmailDialog row={row()} rowType="lead" onClose={() => {}} />);
    const send = screen.getByRole("button", { name: "Send email" }) as HTMLButtonElement;
    fireEvent.click(send);
    await waitFor(() => expect(send.disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(send);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(jsonRes(200, { ok: true }));
  });

  it("shows the server's plain error text", async () => {
    fetchMock.mockResolvedValue(jsonRes(502, { error: "The email could not be sent. Try again." }));
    render(<StatusEmailDialog row={row()} rowType="lead" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The email could not be sent. Try again.");
  });
});

describe("edit details dialog", () => {
  it("posts only the changed field and refreshes on success", async () => {
    const onClose = vi.fn();
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true, changed: ["email"] }));
    render(<EditDetailsDialog row={row()} onClose={onClose} />);
    const save = screen.getByRole("button", { name: "Save details" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@x.com" } });
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toBe("/api/admin/registrations/r1/details");
    expect(init.method).toBe("PATCH");
    expect(lastBody(0)).toEqual({ email: "new@x.com" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the 409 and 422 text and stays open", async () => {
    const onClose = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonRes(409, { error: "Another person on this page already uses that email. Their account is not changed." }));
    render(<EditDetailsDialog row={row()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "dup@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Another person on this page already uses that email");
    expect(onClose).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(jsonRes(422, { error: "Enter a valid email address, like name@example.com." }));
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Enter a valid email address"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables both buttons while saving", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<EditDetailsDialog row={row()} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Zainab Q" } });
    const save = screen.getByRole("button", { name: "Save details" }) as HTMLButtonElement;
    fireEvent.click(save);
    await waitFor(() => expect(save.disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says the account is not changed", () => {
    render(<EditDetailsDialog row={row()} onClose={() => {}} />);
    expect(screen.getByText("The person's account is not changed")).toBeTruthy();
  });
});
