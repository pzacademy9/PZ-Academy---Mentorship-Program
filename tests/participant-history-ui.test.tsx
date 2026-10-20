// tests/participant-history-ui.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MessagesSentList } from "@/components/admin/registrations/MessagesSentList";
import { RegistrationEmailsCard } from "@/components/admin/registrations/RegistrationEmailsCard";
import type { SendListItem } from "@/lib/data/participant-sends";

const send = (over: Partial<SendListItem> = {}): SendListItem => ({
  id: "s1", page_id: "pg1", channel: "email", subject: "Module 2 Schedule", body: "Hello there", template_id: null,
  recipient_count: 12, not_paid_count: 0, not_paid_confirmed: false, created_by: "u1", created_at: "2026-10-15T11:42:00Z",
  senderName: "Sarah Jenkins", counts: { sent: 9, failed: 2, skipped: 1, waiting: 0 }, ...over,
} as SendListItem);

const recipient = (id: string, name: string, state: string, reason = "", extra: Record<string, unknown> = {}) => ({
  id, registration_id: `reg-${id}`, name, email: `${id}@x.com`, phone: "+923001234567", state, reason, sent_at: null, status_at_send: "paid", ...extra,
});

const fetchMock = vi.fn();
const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

function detailReply(s: SendListItem, recipients: unknown[]) {
  return json(200, { send: s, recipients, refIds: {}, portalUrl: null });
}
const open = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("MessagesSentList", () => {
  it("shows one row with date, channel, subject, sender and the three counts", () => {
    render(<MessagesSentList sends={[send()]} />);
    expect(screen.getByRole("heading", { name: "Messages sent" })).toBeTruthy();
    expect(screen.getByText("Module 2 Schedule")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText(/Sarah Jenkins/)).toBeTruthy();
    expect(screen.getAllByText(/15 Oct 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText("Sent 9")).toBeTruthy();
    expect(screen.getByText("Failed 2")).toBeTruthy();
    expect(screen.getByText("Skipped 1")).toBeTruthy();
  });

  it("uses the first words of a WhatsApp message and leaves out a missing sender", () => {
    render(<MessagesSentList sends={[send({ channel: "whatsapp", subject: "", body: "Assalam o alaikum, your class starts tomorrow at nine in the morning sharp", senderName: null })]} />);
    expect(screen.getByText("WhatsApp")).toBeTruthy();
    expect(screen.getByText(/Assalam o alaikum, your class starts tomorrow/)).toBeTruthy();
    expect(screen.queryByText(/Sent by/)).toBeNull();
    expect(screen.queryByText(/u1/)).toBeNull();
  });

  it("says so when nothing was sent yet", () => {
    render(<MessagesSentList sends={[]} />);
    expect(screen.getByText("Nothing has been sent from this campaign yet.")).toBeTruthy();
  });

  it("opens a send and lists each person with their state in plain words", async () => {
    const s = send();
    fetchMock.mockResolvedValueOnce(detailReply(s, [
      recipient("a", "Ayesha Sent", "sent"),
      recipient("b", "Bilal Failed", "failed", "Mailbox full"),
      recipient("c", "Chand Unsub", "skipped", "unsubscribed"),
      recipient("d", "Dua Phone", "skipped", "no_phone"),
      recipient("e", "Esa Email", "skipped", "no_email"),
      recipient("f", "Fiza Dup", "skipped", "merged"),
      recipient("g", "Gul Waiting", "pending"),
    ]));
    render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    expect(await screen.findByText("Bilal Failed")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/participants/sends/s1");
    const rowOf = (n: string) => screen.getByText(n).closest("li")!;
    expect(within(rowOf("Ayesha Sent")).getByText("Sent")).toBeTruthy();
    expect(within(rowOf("Bilal Failed")).getByText("Failed")).toBeTruthy();
    expect(within(rowOf("Bilal Failed")).getByText("The email service could not send this one.")).toBeTruthy();
    expect(within(rowOf("Chand Unsub")).getByText("Unsubscribed")).toBeTruthy();
    expect(within(rowOf("Dua Phone")).getByText("No phone number")).toBeTruthy();
    expect(within(rowOf("Esa Email")).getByText("No email address")).toBeTruthy();
    expect(within(rowOf("Fiza Dup")).getByText("Already included")).toBeTruthy();
    expect(within(rowOf("Gul Waiting")).getByText("Waiting")).toBeTruthy();
  });

  it("shows plain words for a failure, never the provider's own text", async () => {
    const s = send();
    fetchMock.mockResolvedValueOnce(detailReply(s, [recipient("b", "Bilal", "failed", "<img src=x onerror=alert(1)>")]));
    const { container } = render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    expect(await screen.findByText("The email service could not send this one.")).toBeTruthy();
    expect(screen.queryByText(/onerror/)).toBeNull();
    expect(container.ownerDocument.querySelector("img")).toBeNull();
  });

  it("keeps the two known failure reasons as written", async () => {
    const s = send();
    fetchMock.mockResolvedValueOnce(detailReply(s, [
      recipient("b", "Bilal", "failed", "May have been sent. Check before sending again."),
      recipient("c", "Chand", "failed", "No portal link available"),
    ]));
    render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    expect(await screen.findByText("May have been sent. Check before sending again.")).toBeTruthy();
    expect(screen.getByText("No portal link available")).toBeTruthy();
  });

  it("opening a WhatsApp send shows the links list, not the read-only rows", async () => {
    const s = send({ channel: "whatsapp", subject: "", body: "Salam dear" });
    fetchMock.mockResolvedValueOnce(json(200, { send: { body: "Salam dear" }, recipients: [recipient("a", "Ayesha", "pending")], refIds: {}, portalUrl: null }));
    render(<MessagesSentList sends={[s]} />);
    fireEvent.click(screen.getByRole("button", { name: /Salam dear/ }));
    expect(await screen.findByText("Your WhatsApp list")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mark Ayesha as sent/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resend failed|Continue sending/ })).toBeNull();
  });

  it("Resend failed calls retry and then run, and never creates a send", async () => {
    const s = send();
    fetchMock
      .mockResolvedValueOnce(detailReply(s, [recipient("b", "Bilal", "failed", "Mailbox full"), recipient("a", "Ayesha", "sent")]))
      .mockResolvedValueOnce(json(200, { retried: 1 }))
      .mockResolvedValueOnce(json(200, { sent: 1, failed: 0, pending: 0 }))
      .mockResolvedValueOnce(detailReply(s, [recipient("b", "Bilal", "sent"), recipient("a", "Ayesha", "sent")]));
    render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    await screen.findByText("Bilal");
    expect(screen.getByText("Some of these may already have gone out. Check before you resend.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resend failed/ }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4));
    const calls = fetchMock.mock.calls.map(([u, i]) => `${(i?.method ?? "GET")} ${u}`);
    expect(calls[1]).toBe("POST /api/admin/participants/sends/s1/retry");
    expect(calls[2]).toBe("POST /api/admin/participants/sends/s1/run");
    expect(calls.filter((c) => c === "POST /api/admin/participants/sends")).toHaveLength(0);
  });

  it("a second click on Resend failed while it is working does nothing", async () => {
    const s = send();
    let release: (v: unknown) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(detailReply(s, [recipient("b", "Bilal", "failed", "x")]))
      .mockReturnValueOnce(new Promise((r) => { release = r; }))
      .mockResolvedValue(json(200, { sent: 1, failed: 0, pending: 0, send: s, recipients: [] }));
    render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    await screen.findByText("Bilal");
    const btn = screen.getByRole("button", { name: /Resend failed/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    release(json(200, { retried: 1 }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/retry"))).toHaveLength(1));
  });

  it("offers Continue sending for an email that still has people waiting, and runs it", async () => {
    const s = send({ counts: { sent: 5, failed: 0, skipped: 0, waiting: 7 } });
    fetchMock
      .mockResolvedValueOnce(detailReply(s, [recipient("g", "Gul", "pending")]))
      .mockResolvedValueOnce(json(200, { sent: 7, failed: 0, pending: 0 }))
      .mockResolvedValue(detailReply(s, [recipient("g", "Gul", "sent")]));
    render(<MessagesSentList sends={[s]} />);
    open(/Module 2 Schedule/);
    await screen.findByText("Gul");
    fireEvent.click(screen.getByRole("button", { name: "Continue sending" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/run"))).toBe(true));
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/retry"))).toBe(false);
  });

  it("a WhatsApp send only shows states: no resend and no continue", async () => {
    const s = send({ channel: "whatsapp", subject: "", body: "Hi all", counts: { sent: 1, failed: 1, skipped: 0, waiting: 2 } });
    fetchMock.mockResolvedValueOnce(detailReply(s, [recipient("a", "Ayesha", "sent"), recipient("g", "Gul", "pending"), recipient("b", "Bilal", "failed", "x")]));
    render(<MessagesSentList sends={[s]} />);
    open(/Hi all/);
    await screen.findByText("Gul");
    expect(screen.queryByRole("button", { name: /Resend failed/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue sending/ })).toBeNull();
  });

  it("shows a plain error when the detail cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: "boom" }));
    render(<MessagesSentList sends={[send()]} />);
    open(/Module 2 Schedule/);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("RegistrationEmailsCard: messages from the team", () => {
  const auto = [{ kind: "paid" as const, toEmail: "sara@example.com", sentAt: "2026-10-05T09:35:00Z" }];
  const msgs = [
    { registrationId: "r1", channel: "email", subject: "Module 2 Schedule", state: "sent", sentAt: "2026-10-15T11:42:00Z", sendCreatedAt: "2026-10-15T11:40:00Z" },
    { registrationId: "r1", channel: "whatsapp", subject: "", state: "sent", sentAt: "2026-10-16T08:00:00Z", sendCreatedAt: "2026-10-16T07:50:00Z" },
    { registrationId: "r1", channel: "email", subject: "Failed one", state: "failed", sentAt: null, sendCreatedAt: "2026-10-17T07:50:00Z" },
  ];

  it("shows a builder email with subject and time, and a WhatsApp mark, under the automatic emails", () => {
    render(<RegistrationEmailsCard emails={auto} messages={msgs} />);
    expect(screen.getByRole("heading", { name: "Emails sent" })).toBeTruthy();
    expect(screen.getByText("Module 2 Schedule")).toBeTruthy();
    expect(screen.getByText(/15 Oct 2026/)).toBeTruthy();
    expect(screen.getByText("Sent via WhatsApp")).toBeTruthy();
    expect(screen.getByText(/16 Oct 2026/)).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.findIndex((t) => t.includes("Paid"))).toBeLessThan(items.findIndex((t) => t.includes("Module 2 Schedule")));
  });

  it("shows the state of a message that was not sent", () => {
    render(<RegistrationEmailsCard emails={[]} messages={msgs} />);
    expect(within(screen.getByText("Failed one").closest("li")!).getByText("Failed")).toBeTruthy();
  });

  it("keeps the empty state only when there is nothing at all", () => {
    const { unmount } = render(<RegistrationEmailsCard emails={[]} messages={[]} />);
    expect(screen.getByText("No emails sent yet")).toBeTruthy();
    unmount();
    render(<RegistrationEmailsCard emails={[]} messages={msgs} />);
    expect(screen.queryByText("No emails sent yet")).toBeNull();
  });
});
