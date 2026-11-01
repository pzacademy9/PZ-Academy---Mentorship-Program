// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { PortalVisibilitySwitch } from "@/components/admin/landing/PortalVisibilitySwitch";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("PortalVisibilitySwitch", () => {
  it("shows the label and helper text, checked when the batch is shown", () => {
    render(<PortalVisibilitySwitch pageId="p1" showInPortal={true} />);
    const box = screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText(/Turn off to hide it/)).toBeTruthy();
  });

  it("posts show false when turned off, then reports it", async () => {
    render(<PortalVisibilitySwitch pageId="p1" showInPortal={true} />);
    const box = screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-pages/p1/portal");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ show: false });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Hidden from the public progress portal."));
    expect(refresh).toHaveBeenCalled();
    expect(box.checked).toBe(false);
  });

  it("posts show true when turned on", async () => {
    render(<PortalVisibilitySwitch pageId="p1" showInPortal={false} />);
    fireEvent.click(screen.getByLabelText(/Show on public progress portal/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ show: true });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Shown on the public progress portal."));
  });

  it("shows the failure and leaves the box unchanged", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Could not save. Try again." }) });
    render(<PortalVisibilitySwitch pageId="p1" showInPortal={true} />);
    const box = screen.getByLabelText(/Show on public progress portal/) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not save. Try again."));
    expect(box.checked).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
