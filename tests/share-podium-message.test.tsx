import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ write: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.error } }));
vi.mock("@/lib/progress/share-podium", () => ({
  fetchPodiumBlob: vi.fn().mockResolvedValue(new Blob(["x"])),
  saveBlobViaLink: vi.fn(),
  sharePodiumBlob: vi.fn().mockResolvedValue(undefined),
}));

import { SharePodium } from "@/components/progress/portal/SharePodium";

beforeEach(() => {
  h.write.mockReset().mockResolvedValue(undefined);
  h.error.mockReset();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: h.write }, configurable: true });
});

const open = () => fireEvent.click(screen.getByRole("button", { name: /share podium/i }));

describe("SharePodium message item", () => {
  it("has two items without messageText", async () => {
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" />);
    open();
    await screen.findByText("Square picture");
    expect(screen.queryByText("Copy message")).toBeNull();
    expect(screen.getAllByRole("button").filter((b) => b.closest("[role=group]"))).toHaveLength(2);
  });
  it("has three items and copies the fetched text", async () => {
    const messageText = vi.fn().mockResolvedValue("Hello podium");
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" messageText={messageText} />);
    open();
    const item = await screen.findByRole("button", { name: /copy message/i });
    expect(screen.getByText("Names and points, ready to post")).toBeTruthy();
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(item);
    expect(h.write).toHaveBeenCalledWith("Hello podium");
    expect(messageText).toHaveBeenCalledTimes(1);
  });
  it("shows an alert when the text cannot be made", async () => {
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" messageText={async () => null} />);
    open();
    expect(await screen.findByText("Could not make this message. Please try again later.")).toBeTruthy();
  });
  it("toasts when the clipboard fails", async () => {
    h.write.mockRejectedValue(new Error("no"));
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" messageText={async () => "Hi"} />);
    open();
    const item = await screen.findByRole("button", { name: /copy message/i });
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(item);
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Could not copy."));
  });
  it("fetches again when the menu is reopened", async () => {
    const messageText = vi.fn().mockResolvedValue("Hello");
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" messageText={messageText} />);
    open();
    const item = await screen.findByRole("button", { name: /copy message/i });
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(item);
    expect(screen.queryByRole("group")).toBeNull();
    open();
    await waitFor(() => expect(messageText).toHaveBeenCalledTimes(2));
  });
  it("toasts and closes when there is no clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<SharePodium slug="b1" title="B" pick="s1" label="Class 1" messageText={async () => "Hi"} />);
    open();
    const item = await screen.findByRole("button", { name: /copy message/i });
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(item);
    expect(screen.queryByRole("group")).toBeNull();
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Could not copy."));
  });
});
