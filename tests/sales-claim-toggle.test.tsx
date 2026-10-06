import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { toast } from "sonner";
import { ClaimSettingToggle } from "@/components/admin/sales/ClaimSettingToggle";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
function stubFetch(ok: boolean) {
  fetchMock = vi.fn(async () => ({ ok, json: async () => (ok ? { value: true } : { error: "Could not save the setting." }) }));
  vi.stubGlobal("fetch", fetchMock);
}
beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("ClaimSettingToggle", () => {
  it("renders the switch from the initial value", () => {
    stubFetch(true);
    render(<ClaimSettingToggle initial={false} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Let agents claim unassigned contacts")).toBeTruthy();
  });

  it("PUTs the new value, flips optimistically and toasts", async () => {
    stubFetch(true);
    render(<ClaimSettingToggle initial={false} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Agents can now claim contacts."));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/sales/settings/claim");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ value: true });
  });

  it("toasts the off message when turning off", async () => {
    stubFetch(true);
    render(<ClaimSettingToggle initial={true} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Claiming is off. Contacts come only from your assignments."),
    );
  });

  it("reverts and shows an error when the save fails", async () => {
    stubFetch(false);
    render(<ClaimSettingToggle initial={false} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save the setting."));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });
});
