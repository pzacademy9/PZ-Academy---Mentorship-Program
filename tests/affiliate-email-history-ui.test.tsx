import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AffiliateEmailHistory } from "@/components/admin/affiliates/AffiliateEmailHistory";
import type { MotivationSendRow } from "@/lib/data/affiliate-motivation-sends";

const row = (over: Partial<MotivationSendRow> & { id: string }): MotivationSendRow => ({
  createdAt: "2026-11-10T10:00:00Z",
  subject: "Keep going",
  recipientCount: 2,
  failedCount: 0,
  recipients: [
    { name: "Ayesha Khan", ok: true },
    { name: "Bilal Raza", ok: true },
  ],
  ...over,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("AffiliateEmailHistory", () => {
  it("lists cards in the order given with subject and Sent to N people", () => {
    render(
      <AffiliateEmailHistory
        failed={false}
        sends={[row({ id: "a", subject: "Newest one", recipientCount: 1 }), row({ id: "b", subject: "Older one", recipientCount: 5 })]}
      />,
    );
    const cards = screen.getAllByRole("button", { name: /Sent to/ });
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch(/Newest one/);
    expect(cards[0].textContent).toMatch(/Sent to 1 person/);
    expect(cards[1].textContent).toMatch(/Sent to 5 people/);
  });

  it("shows N failed only when failed is above 0", () => {
    render(<AffiliateEmailHistory failed={false} sends={[row({ id: "a", failedCount: 3 }), row({ id: "b", subject: "Clean" })]} />);
    expect(screen.getAllByText("3 failed")).toHaveLength(1);
    expect(screen.queryByText("0 failed")).toBeNull();
  });

  it("shows the empty state", () => {
    render(<AffiliateEmailHistory failed={false} sends={[]} />);
    expect(screen.getByText("No motivation emails sent yet")).toBeTruthy();
  });

  it("shows a calm line when history could not be loaded", () => {
    render(<AffiliateEmailHistory failed sends={[]} />);
    expect(screen.getByText("History could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No motivation emails sent yet")).toBeNull();
  });

  it("opens a card: fetches the html into a sandboxed iframe and lists recipient names", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ html: "<p>Hello there</p>" }) });
    render(<AffiliateEmailHistory failed={false} sends={[row({ id: "abc", failedCount: 1, recipients: [{ name: "Ayesha Khan", ok: true }, { name: "Bilal Raza", ok: false }] })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Sent to/ }));
    await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    const frame = document.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBe("<p>Hello there</p>");
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/admin/affiliates/motivation-sends/abc");
    expect(screen.getByText("Ayesha Khan")).toBeTruthy();
    expect(screen.getByText("Bilal Raza")).toBeTruthy();
  });

  it("says Could not open this email. when the fetch fails", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<AffiliateEmailHistory failed={false} sends={[row({ id: "abc" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Sent to/ }));
    await waitFor(() => expect(screen.getByText("Could not open this email.")).toBeTruthy());
    expect(document.querySelector("iframe")).toBeNull();
  });
});
