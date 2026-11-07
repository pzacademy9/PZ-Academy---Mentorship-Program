import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { TermsTabs } from "@/components/admin/terms/TermsTabs";

const initial = { general: "G text", affiliate_terms: "T text", affiliate_rules: "R text", affiliate_privacy: "P text" };

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }));
});

describe("TermsTabs", () => {
  it("shows four tabs, General first", () => {
    render(<TermsTabs initial={initial} />);
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["General", "Affiliate Terms", "Affiliate Rules", "Affiliate Privacy"]);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("G text");
  });
  it("switching tab shows that document and saves under its own key", async () => {
    render(<TermsTabs initial={initial} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliate Rules" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("R text");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "R new" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/admin/site-terms?key=affiliate_rules");
    expect(JSON.parse(init.body)).toEqual({ body: "R new" });
  });
});
