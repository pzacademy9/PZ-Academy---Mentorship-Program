import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const confirmFn = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));

import { AffiliateApplicationsTab } from "@/components/admin/affiliates/AffiliateApplicationsTab";
import { DropReasonDialog } from "@/components/admin/affiliates/DropReasonDialog";
import { AffiliatesAdmin } from "@/components/admin/affiliates/AffiliatesAdmin";
import type { AffiliateRow } from "@/lib/data/affiliates";

const base: AffiliateRow = {
  id: "a1", status: "applied", name: "Waiting Wendy", email: "wendy@example.com", whatsapp: "+923001234567",
  cityCountry: "Lahore, Pakistan", answers: {},
  code: null, team: null, commissionMode: "automatic", manualPercent: null, openingSecured: 0, openingCommission: 0, openingWithdrawn: 0,
  isImported: false, termsAcceptedAt: "2026-11-01T00:00:00Z", termsVersion: "v", acceptedAt: null, droppedAt: null, dropReason: null, leftAt: null, createdAt: "2026-11-01T00:00:00Z",
};
const acc = { ...base, id: "a2", status: "accepted" as const, name: "Sara Khan", email: "sara@example.com", code: "SK321", acceptedAt: "2026-11-02T00:00:00Z" };
const drop1 = { ...base, id: "a3", status: "dropped" as const, name: "Dina Dropped", email: "dina@example.com", droppedAt: "2026-11-05T00:00:00Z", dropReason: "Not a fit right now." };
const drop2 = { ...base, id: "a4", status: "dropped" as const, name: "Old Drop", email: "old@example.com", droppedAt: "2026-11-03T00:00:00Z", dropReason: null };
const left = { ...base, id: "a5", status: "left" as const, name: "Leo Left", email: "leo@example.com", code: "LL111", acceptedAt: "2026-10-01T00:00:00Z", leftAt: "2026-11-04T00:00:00Z" };
const rows = [base, acc, drop1, drop2, left];

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  toast.success.mockReset(); toast.error.mockReset(); refresh.mockReset();
  confirmFn.mockReset().mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn());
});

describe("AffiliateApplicationsTab", () => {
  it("count tiles match the rows and Left is not a tile", () => {
    render(<AffiliateApplicationsTab rows={rows} onOpen={() => {}} onClearOld={() => {}} />);
    const strip = within(screen.getByTestId("count-strip"));
    expect(strip.getByText("Waiting").nextElementSibling?.textContent).toBe("1");
    expect(strip.getByText("Accepted").nextElementSibling?.textContent).toBe("1");
    expect(strip.getByText("Dropped").nextElementSibling?.textContent).toBe("2");
    expect(strip.queryByText("Left")).toBeNull();
  });

  it("shows the calm empty state when nobody is waiting", () => {
    render(<AffiliateApplicationsTab rows={[acc]} onOpen={() => {}} onClearOld={() => {}} />);
    expect(screen.getByText("No applications waiting. New ones show up here.")).toBeTruthy();
  });

  it("lists waiting people and opens one on tap", () => {
    const onOpen = vi.fn();
    render(<AffiliateApplicationsTab rows={rows} onOpen={onOpen} onClearOld={() => {}} />);
    fireEvent.click(within(screen.getByTestId("waiting-list")).getByRole("button", { name: /Waiting Wendy/ }));
    expect(onOpen).toHaveBeenCalledWith("a1");
  });

  it("Decided shows reasons, No reason recorded, the code of accepted people, newest decision first", () => {
    render(<AffiliateApplicationsTab rows={rows} onOpen={() => {}} onClearOld={() => {}} />);
    const items = within(screen.getByTestId("decided-list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Dina Dropped"),
      expect.stringContaining("Leo Left"),
      expect.stringContaining("Old Drop"),
      expect.stringContaining("Sara Khan"),
    ]);
    expect(items[0].textContent).toContain("Not a fit right now.");
    expect(items[2].textContent).toContain("No reason recorded");
    expect(items[3].textContent).toContain("SK321");
    expect(items[0].textContent).not.toContain("SK321");
  });

  it("filters narrow the Decided list", () => {
    render(<AffiliateApplicationsTab rows={rows} onOpen={() => {}} onClearOld={() => {}} />);
    const names = () => within(screen.getByTestId("decided-list")).getAllByRole("listitem").map((li) => li.textContent ?? "");
    fireEvent.click(screen.getByRole("button", { name: "Dropped" }));
    expect(names()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("Leo Left");
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(names()[0]).toContain("Sara Khan");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(names()).toHaveLength(4);
  });

  it("tapping a decided row opens it", () => {
    const onOpen = vi.fn();
    render(<AffiliateApplicationsTab rows={rows} onOpen={onOpen} onClearOld={() => {}} />);
    fireEvent.click(within(screen.getByTestId("decided-list")).getByRole("button", { name: /Sara Khan/ }));
    expect(onOpen).toHaveBeenCalledWith("a2");
  });

  it("has a quiet Clear old email history link that calls onClearOld", () => {
    const onClearOld = vi.fn();
    render(<AffiliateApplicationsTab rows={rows} onOpen={() => {}} onClearOld={onClearOld} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear old email history" }));
    expect(onClearOld).toHaveBeenCalled();
  });
});

describe("DropReasonDialog", () => {
  const open = (onConfirm = vi.fn(), onCancel = vi.fn()) => {
    render(<DropReasonDialog name="Dina" open onCancel={onCancel} onConfirm={onConfirm} />);
    return { onConfirm, onCancel, box: screen.getByLabelText(/Reason/) as HTMLTextAreaElement, drop: screen.getByRole("button", { name: "Drop" }) as HTMLButtonElement };
  };

  it("has dialog semantics, helper text, focus on the box and a counter", () => {
    const { box } = open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Drop Dina?")).toBeTruthy();
    expect(screen.getByText("This is saved for your records. They will get an email saying their status is Dropped.")).toBeTruthy();
    expect(document.activeElement).toBe(box);
    expect(screen.getByText("0 / 500")).toBeTruthy();
    fireEvent.change(box, { target: { value: "abc" } });
    expect(screen.getByText("3 / 500")).toBeTruthy();
  });

  it("blocks a blank, spaces-only or 501-character reason", () => {
    const { box, drop, onConfirm } = open();
    expect(drop.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "   " } });
    expect(drop.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "x".repeat(501) } });
    expect(drop.disabled).toBe(true);
    fireEvent.click(drop);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms with the trimmed reason; Cancel and Escape cancel", () => {
    const { box, drop, onConfirm, onCancel } = open();
    fireEvent.change(box, { target: { value: "  Not a fit  " } });
    fireEvent.click(drop);
    expect(onConfirm).toHaveBeenCalledWith("Not a fit");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe("AffiliatesAdmin with the Applications tab", () => {
  it("shows the full list on Applications and opens the detail from a decided row", () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ link: null, emails: [] }) });
    render(<AffiliatesAdmin tab="applications" initial={rows} />);
    expect(screen.getByText("Waiting Wendy")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("decided-list")).getByRole("button", { name: /Sara Khan/ }));
    expect(within(screen.getByRole("dialog")).getByText(/Code/)).toBeTruthy();
  });

  it("the Affiliates tab no longer has the old top-level clear button", () => {
    render(<AffiliatesAdmin tab="affiliates" initial={rows} />);
    expect(screen.queryByRole("button", { name: /clear old email history/i })).toBeNull();
  });

  it("the quiet link confirms, then deletes history older than 90 days", async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ removed: 3 }) });
    render(<AffiliatesAdmin tab="applications" initial={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear old email history" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(confirmFn.mock.calls[0][0].title).toBe("Clear email history older than 90 days?");
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/affiliates/emails?olderThanDays=90");
    expect(fetchMock().mock.calls[0][1].method).toBe("DELETE");
  });

  it("the quiet link does nothing when the owner says no", async () => {
    confirmFn.mockResolvedValue(false);
    render(<AffiliatesAdmin tab="applications" initial={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear old email history" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
