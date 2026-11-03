import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { GeneralTermsEditor } from "@/components/admin/terms/GeneralTermsEditor";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("GeneralTermsEditor", () => {
  it("shows the saved text and explains that a page's own Terms win", () => {
    render(<GeneralTermsEditor initial="1. Saved rule" />);
    expect((screen.getByLabelText("General Terms and Conditions") as HTMLTextAreaElement).value).toBe("1. Saved rule");
    expect(screen.getByText(/own Terms win/i)).toBeTruthy();
  });

  it("saves what is typed", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true }));
    render(<GeneralTermsEditor initial="" />);
    fireEvent.change(screen.getByLabelText("General Terms and Conditions"), { target: { value: "New fake text" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [url, init] = fetchMock().mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/site-terms");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ body: "New fake text" });
  });

  it("tells the owner in plain words when saving failed", async () => {
    fetchMock().mockResolvedValue(reply(500, { error: "Could not save the Terms. Please try again." }));
    render(<GeneralTermsEditor initial="x" />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save the Terms. Please try again."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("warns when the text is over the limit and does not send it", async () => {
    render(<GeneralTermsEditor initial={"a".repeat(20001)} />);
    expect(screen.getByText(/too long/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
