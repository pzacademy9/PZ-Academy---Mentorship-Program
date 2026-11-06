import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  loadClassEmailHistory: h.load,
}));

import { ClassEmailHistory } from "@/components/admin/classes/ClassEmailHistory";

afterEach(() => { cleanup(); h.load.mockReset(); });

const round = (over: Record<string, unknown> = {}) => ({
  id: "r1", kind: "reminder", subject: "Reminder: Intro is coming up", createdAt: "2026-11-06T12:30:00.000Z", total: 3,
  counts: { sent: 1, failed: 1, skipped: 1, waiting: 0 },
  recipients: [
    { name: "Fake One", email: "fake.one@example.com", state: "sent", reason: "" },
    { name: "Fake Two", email: "fake.two@example.com", state: "failed", reason: "Brevo said no" },
    { name: "Fake Three", email: "fake.three@example.com", state: "skipped", reason: "unsubscribed" },
  ],
  ...over,
});

describe("ClassEmailHistory", () => {
  it("loads only when opened and shows each email with plain counts", async () => {
    h.load.mockResolvedValue({ ok: true, rounds: [round()] });
    render(<ClassEmailHistory pageId="p" sessionId="s1" kinds={["reminder", "update"]} refreshKey={0} />);
    expect(h.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Who got the emails"));
    expect(await screen.findByText("Zoom link email")).toBeTruthy();
    expect(h.load).toHaveBeenCalledWith("s1");
    expect(screen.getByText("1 sent · 1 failed · 1 skipped · 0 waiting")).toBeTruthy();
    expect(screen.getByText("Reminder: Intro is coming up")).toBeTruthy();
  });

  it("shows each person with a plain reason, never the provider's text", async () => {
    h.load.mockResolvedValue({ ok: true, rounds: [round()] });
    render(<ClassEmailHistory pageId="p" sessionId="s1" kinds={["reminder", "update"]} refreshKey={0} />);
    fireEvent.click(screen.getByText("Who got the emails"));
    const list = within(await screen.findByRole("list", { name: "Zoom link email people" }));
    expect(list.getByText("Fake One").closest("li")!.textContent).toMatch(/Sent/);
    expect(list.getByText("Fake Two").closest("li")!.textContent).toMatch(/Could not be sent/);
    expect(screen.queryByText(/Brevo said no/)).toBeNull();
    expect(list.getByText("Fake Three").closest("li")!.textContent).toMatch(/Unsubscribed/);
  });

  it("only shows the kinds it was given, and says when nothing went out", async () => {
    h.load.mockResolvedValue({ ok: true, rounds: [round({ kind: "feedback" })] });
    render(<ClassEmailHistory pageId="p" sessionId="s1" kinds={["reminder", "update"]} refreshKey={0} />);
    fireEvent.click(screen.getByText("Who got the emails"));
    expect(await screen.findByText("No email has been sent for this class yet.")).toBeTruthy();
  });

  it("explains a failed load and reloads when the refresh key changes", async () => {
    h.load.mockResolvedValueOnce({ ok: false, message: "Something went wrong. Please try again." });
    const { rerender } = render(<ClassEmailHistory pageId="p" sessionId="s1" kinds={["reminder", "update"]} refreshKey={0} />);
    fireEvent.click(screen.getByText("Who got the emails"));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
    h.load.mockResolvedValue({ ok: true, rounds: [round()] });
    rerender(<ClassEmailHistory pageId="p" sessionId="s1" kinds={["reminder", "update"]} refreshKey={1} />);
    await waitFor(() => expect(screen.getByText("Zoom link email")).toBeTruthy());
  });
});
