import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MediaLibrary } from "@/components/admin/landing/MediaLibrary";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

const item = (id: string, name: string) => ({
  id, driveFileId: `f${id}`, url: `https://drive.google.com/uc?id=f${id}`, name, folder: "misc" as const,
  width: null, height: null, orientation: null, sizeBytes: null, createdAt: "2026-10-01T00:00:00Z",
});
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const mount = () => render(<ConfirmProvider><MediaLibrary initialItems={[item("a", "Old one")]} /></ConfirmProvider>);
const BTN = "Add pictures already on the website";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("Add pictures already on the website", () => {
  it("shows Looking... and is disabled while running, then toasts and reloads the list", async () => {
    let finish: (v: unknown) => void = () => {};
    fetchMock()
      .mockReturnValueOnce(new Promise((r) => { finish = r; }))
      .mockResolvedValueOnce(reply(200, { items: [item("a", "Old one"), item("n", "New picture")] }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    const busy = await screen.findByRole("button", { name: /Looking/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/landing-media/import-existing");
    expect(fetchMock().mock.calls[0][1].method).toBe("POST");
    finish(reply(200, { added: 2, alreadyThere: 1, skipped: 0 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added 2 pictures"));
    await waitFor(() => expect(screen.getByText("New picture")).toBeTruthy());
    expect(fetchMock().mock.calls[1][0]).toBe("/api/admin/landing-media");
    expect((screen.getByRole("button", { name: BTN }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says no new pictures found and mentions left-out ones", async () => {
    fetchMock()
      .mockResolvedValueOnce(reply(200, { added: 0, alreadyThere: 4, skipped: 3 }))
      .mockResolvedValueOnce(reply(200, { items: [item("a", "Old one")] }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    const msg = toast.success.mock.calls[0][0] as string;
    expect(msg).toContain("No new pictures found");
    expect(msg).toContain("3 pictures are not stored in Google Drive and were left out.");
  });

  it("uses the singular for one picture", async () => {
    fetchMock()
      .mockResolvedValueOnce(reply(200, { added: 1, alreadyThere: 0, skipped: 0 }))
      .mockResolvedValueOnce(reply(200, { items: [] }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added 1 picture"));
  });

  it("shows the error and keeps the list when it fails", async () => {
    fetchMock().mockResolvedValueOnce(reply(500, { error: "Could not add the existing pictures. Please try again." }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not add the existing pictures. Please try again."));
    expect(screen.getByText("Old one")).toBeTruthy();
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
});
