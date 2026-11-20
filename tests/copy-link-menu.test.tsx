import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ write: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.error } }));

import { CopyLinkMenu } from "@/components/admin/classes/CopyLinkMenu";

function mount() {
  return render(<CopyLinkMenu label="Copy attendance link" link="https://x.test/a" message="Hello https://x.test/a" className="btn" />);
}

beforeEach(() => {
  h.write.mockReset();
  h.error.mockReset();
  h.write.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: h.write }, configurable: true });
});

describe("CopyLinkMenu", () => {
  it("shows the label and opens two items", () => {
    mount();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy with message" })).toBeTruthy();
  });

  it("copies the link", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(h.write).toHaveBeenCalledWith("https://x.test/a"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("copies the message", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy with message" }));
    await waitFor(() => expect(h.write).toHaveBeenCalledWith("Hello https://x.test/a"));
  });

  it("closes on Escape and returns focus", () => {
    mount();
    const t = screen.getByRole("button", { name: "Copy attendance link" });
    fireEvent.click(t);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(t);
  });

  it("closes on click outside", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("toasts on a failed write and does not show Copied", async () => {
    h.write.mockRejectedValue(new Error("no"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy attendance link" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Could not copy. Select the link and copy it by hand."));
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });
});
