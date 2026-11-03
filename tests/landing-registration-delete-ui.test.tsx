// tests/landing-registration-delete-ui.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DeleteRegistrationDialog } from "@/components/admin/registrations/DeleteRegistrationDialog";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (over: Partial<RegistrationListRow> = {}): RegistrationListRow => ({
  id: "r1", refId: "PZA-1", name: "Test Person", email: "t@x.com", pageId: "pg1", pageTitle: "PPC", optionLabel: "Full", mode: "live",
  region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR", status: "pending", agentId: null, agentName: null, groupSize: 1,
  isTest: false, createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null, voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false,
  lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, groupId: null, ...over,
});

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("DeleteRegistrationDialog", () => {
  it("cannot delete until DELETE is typed, and sends nothing before that", () => {
    render(<DeleteRegistrationDialog row={row()} onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: /delete for good/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: "delete" } });
    expect(btn.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends a DELETE once DELETE is typed, then closes and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, removedMembers: 0 }) });
    const onClose = vi.fn();
    render(<DeleteRegistrationDialog row={row()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /delete for good/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/registrations/r1", { method: "DELETE" });
    expect(refresh).toHaveBeenCalled();
  });
  it("shows the server's reason and stays open when it refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Delete their row in the sheet first." }) });
    const onClose = vi.fn();
    render(<DeleteRegistrationDialog row={row()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /delete for good/i }));
    expect(await screen.findByText("Delete their row in the sheet first.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  it("says how many group members go with a group lead", () => {
    render(<DeleteRegistrationDialog row={row({ groupSize: 4, rowType: "lead" })} onClose={() => {}} />);
    expect(screen.getByText(/3 group members are removed with it/)).toBeTruthy();
  });
});
