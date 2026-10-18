import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MediaLibrary } from "@/components/admin/landing/MediaLibrary";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { navForRole } from "@/components/dashboard/nav";

const item = (id: string, name: string, folder = "misc") => ({
  id, driveFileId: `f${id}`, url: `https://drive.google.com/uc?id=f${id}`, name, folder: folder as "misc",
  width: 1600, height: 900, orientation: "wide" as const, sizeBytes: 1000, createdAt: "2026-10-01T00:00:00Z",
});
const ITEMS = [item("a", "Hero one", "heroes"), item("b", "Dr Sara", "instructors")];
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const mount = () => render(<ConfirmProvider><MediaLibrary initialItems={ITEMS} /></ConfirmProvider>);

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("MediaLibrary", () => {
  it("renders initial pictures and search narrows", () => {
    mount();
    expect(screen.getByText("Hero one")).toBeTruthy();
    expect(screen.getByText("Dr Sara")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search pictures"), { target: { value: "sara" } });
    expect(screen.queryByText("Hero one")).toBeNull();
    expect(screen.getByText("Dr Sara")).toBeTruthy();
  });

  it("rename sends PATCH and updates the name", async () => {
    fetchMock().mockResolvedValue(reply(200, { item: { ...ITEMS[0], name: "Banner" } }));
    mount();
    fireEvent.click(screen.getByLabelText("Rename Hero one"));
    fireEvent.change(screen.getByLabelText("Picture name"), { target: { value: "Banner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByText("Banner")).toBeTruthy());
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/api/admin/landing-media/a");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "Banner" });
  });

  it("refuses an empty rename and sends nothing", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Rename Hero one"));
    fireEvent.change(screen.getByLabelText("Picture name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByText(/give the picture a name/i)).toBeTruthy();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("refuses a name over 80 characters", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Rename Hero one"));
    fireEvent.change(screen.getByLabelText("Picture name"), { target: { value: "x".repeat(81) } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByText(/80 characters/i)).toBeTruthy();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("blocked delete shows Used by and keeps the picture", async () => {
    fetchMock().mockResolvedValue(reply(409, { error: "This picture is used by: Spring Webinar. Remove it first.", pages: [{ id: "p", title: "Spring Webinar", slug: "s" }] }));
    mount();
    fireEvent.click(screen.getByLabelText("Delete Hero one"));
    expect(fetchMock()).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText(/Used by: Spring Webinar/)).toBeTruthy());
    expect(screen.getByText("Hero one")).toBeTruthy();
  });

  it("successful delete removes the picture", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true }));
    mount();
    fireEvent.click(screen.getByLabelText("Delete Hero one"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Hero one")).toBeNull());
    expect(fetchMock().mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("nav", () => {
  it("Media Library for admin, not student", () => {
    expect(navForRole("admin").some((i) => i.label === "Media Library")).toBe(true);
    expect(navForRole("super_admin").some((i) => i.label === "Media Library")).toBe(true);
    expect(navForRole("student").some((i) => i.label === "Media Library")).toBe(false);
  });
});
