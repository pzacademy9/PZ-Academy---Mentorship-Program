import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MyPromoCode } from "@/components/sales/MyPromoCode";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("MyPromoCode with no code yet", () => {
  it("shows a name box with PZ- in front and a create button", () => {
    render(<MyPromoCode promo={null} />);
    expect(screen.getByText("PZ-")).toBeTruthy();
    expect(screen.getByLabelText(/your code name/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /create my code/i })).toBeTruthy();
  });
  it("posts the name and then shows the new code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, code: "PZ-AHM" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyPromoCode promo={null} />);
    fireEvent.change(screen.getByLabelText(/your code name/i), { target: { value: "ahm" } });
    fireEvent.click(screen.getByRole("button", { name: /create my code/i }));
    await waitFor(() => expect(screen.getByText("PZ-AHM")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/sales/my-code", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "ahm" }) }));
    expect(screen.queryByRole("button", { name: /create my code/i })).toBeNull();
  });
  it("shows the server's message and keeps the box when it is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "That code is already taken. Try another." }, { status: 409 })));
    render(<MyPromoCode promo={null} />);
    fireEvent.change(screen.getByLabelText(/your code name/i), { target: { value: "ahm" } });
    fireEvent.click(screen.getByRole("button", { name: /create my code/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/already taken/i));
    expect(screen.getByRole("button", { name: /create my code/i })).toBeTruthy();
  });
});

describe("MyPromoCode with a code", () => {
  it("shows the code, how many used it and how many paid", () => {
    render(<MyPromoCode promo={{ code: "PZ-AHM", used: 7, paid: 3 }} />);
    expect(screen.getByText("PZ-AHM")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/used it/i)).toBeTruthy();
    expect(screen.queryByLabelText(/your code name/i)).toBeNull();
  });
  it("copies the code", async () => {
    render(<MyPromoCode promo={{ code: "PZ-AHM", used: 0, paid: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("PZ-AHM"));
  });
});
