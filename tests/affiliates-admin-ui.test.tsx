import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const confirmFn = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));

import { AffiliatesAdmin } from "@/components/admin/affiliates/AffiliatesAdmin";
import type { AffiliateRow } from "@/lib/data/affiliates";

const base: AffiliateRow = {
  id: "a1", status: "applied", name: "Test Person", email: "test.person@example.com", whatsapp: "+923001234567",
  cityCountry: "Lahore, Pakistan",
  answers: { status: "student", organization: "Test University", field: "PharmD", why: "I help my class.", hoursPerWeek: "4-6", ratings: { marketing: 4, eventPromotion: 3, onlineEngagement: 5, communication: 2 }, commissionExperience: { yes: true, details: "Sold passes" } },
  code: null, team: null, commissionMode: "automatic", manualPercent: null, openingSecured: 0, openingCommission: 0, openingWithdrawn: 0,
  isImported: false, termsAcceptedAt: "2026-11-01T00:00:00Z", termsVersion: "v", acceptedAt: null, droppedAt: null, leftAt: null, createdAt: "2026-11-01T00:00:00Z",
};
const accepted: AffiliateRow = { ...base, id: "a2", status: "accepted", name: "Sara Khan", email: "sara@example.com", code: "SK321", team: "Blue", acceptedAt: "2026-11-02T00:00:00Z" };

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  refresh.mockReset();
  confirmFn.mockReset().mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn());
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("AffiliatesAdmin", () => {
  it("has the Applications and Affiliates tabs only, with applicants under Applications", () => {
    render(<AffiliatesAdmin initial={[base, accepted]} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Applications", "Affiliates"]);
    expect(screen.getByText("Test Person")).toBeTruthy();
    expect(screen.queryByText("Sara Khan")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    expect(screen.getByText("Sara Khan")).toBeTruthy();
    expect(screen.getByText("SK321")).toBeTruthy();
    expect(screen.queryByText("Test Person")).toBeNull();
  });

  it("the card list cannot scroll sideways on a phone", () => {
    render(<AffiliatesAdmin initial={[base]} />);
    const list = screen.getByTestId("affiliate-cards");
    expect(list.className).toMatch(/min-w-0|w-full/);
    const html = list.outerHTML;
    expect(html).not.toMatch(/whitespace-nowrap|overflow-x-(auto|scroll)|min-w-\[/);
    expect(html).toMatch(/break-words|truncate/);
  });

  it("opens the application with every answer, a code field and a team picker", () => {
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Test University")).toBeTruthy();
    expect(d.getByText("I help my class.")).toBeTruthy();
    expect(d.getByText(/Sold passes/)).toBeTruthy();
    expect(d.getByLabelText(/code/i)).toBeTruthy();
    expect(d.getByLabelText(/team/i)).toBeTruthy();
    expect(d.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(d.getByRole("button", { name: "Drop" })).toBeTruthy();
  });

  it("accepts with the typed code and team", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, code: "TP500", emailSent: true }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.change(d.getByLabelText(/code/i), { target: { value: "tp500" } });
    fireEvent.change(d.getByLabelText(/team/i), { target: { value: "Blue" } });
    fireEvent.click(d.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [url, init] = fetchMock().mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/affiliates/a1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ action: "accept", code: "tp500", team: "Blue" });
    expect(refresh).toHaveBeenCalled();
  });

  it("an empty code field sends no code, so the next one is made", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, code: "TP321", emailSent: true }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(JSON.parse(fetchMock().mock.calls[0][1].body)).toEqual({ action: "accept", team: null });
  });

  it("when the email was not sent it says so and shows Resend", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, code: "TP321", emailSent: false }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Email not sent/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /resend/i })).toBeTruthy();
    fetchMock().mockResolvedValue(reply(200, { ok: true, emailSent: true }));
    fireEvent.click(screen.getByRole("button", { name: /resend/i }));
    await waitFor(() => expect(JSON.parse(fetchMock().mock.calls[1][1].body)).toEqual({ action: "resend" }));
  });

  it("shows the plain server message when the code is taken", async () => {
    fetchMock().mockResolvedValue(reply(409, { error: "That code is already taken. Try another." }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That code is already taken. Try another."));
  });

  it("Drop asks first and does nothing when the owner says no", async () => {
    confirmFn.mockResolvedValue(false);
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("Drop sends the drop after a yes", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, emailSent: true }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /Test Person/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(JSON.parse(fetchMock().mock.calls[0][1].body)).toEqual({ action: "drop" });
  });

  it("an accepted affiliate: copies the private link, saves commission, marks as left", async () => {
    fetchMock().mockImplementation(async (url: string, init?: { method?: string }) =>
      !init?.method || init.method === "GET"
        ? reply(200, { affiliate: accepted, link: "https://pharmacozyme.com/affiliate/tok123" })
        : reply(200, { ok: true, emailSent: true }),
    );
    render(<AffiliatesAdmin initial={[accepted]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    fireEvent.click(screen.getByRole("button", { name: /Sara Khan/ }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.click(await d.findByRole("button", { name: /copy private link/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://pharmacozyme.com/affiliate/tok123"));

    fireEvent.change(d.getByLabelText(/commission/i), { target: { value: "manual" } });
    fireEvent.change(d.getByLabelText(/percent/i), { target: { value: "9" } });
    fireEvent.click(d.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(fetchMock().mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true));
    const saved = JSON.parse(fetchMock().mock.calls.find((c) => c[1]?.method === "PATCH")![1].body);
    expect(saved).toMatchObject({ action: "update", commissionMode: "manual", manualPercent: 9 });

    fireEvent.click(d.getByRole("button", { name: /mark as left/i }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
  });
});

describe("email history in the admin screen", () => {
  const history = [
    { id: "e1", kind: "accepted", toEmail: "sara@example.com", status: "failed", error: "Affiliate email is not set up", createdAt: "2026-11-08T10:00:00Z" },
    { id: "e0", kind: "accepted", toEmail: "sara@example.com", status: "sent", error: null, createdAt: "2026-11-07T10:00:00Z" },
  ];
  const get = () =>
    fetchMock().mockImplementation(async (_u: string, init?: { method?: string }) =>
      !init?.method || init.method === "GET"
        ? reply(200, { affiliate: accepted, link: "https://pharmacozyme.com/affiliate/tok", emails: history })
        : reply(200, { ok: true, removed: 2 }),
    );

  it("flags a card whose last email failed", () => {
    render(<AffiliatesAdmin initial={[accepted]} emailFailedIds={["a2"]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    expect(screen.getByText("Email failed")).toBeTruthy();
  });

  it("shows no flag when nothing failed", () => {
    render(<AffiliatesAdmin initial={[accepted]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    expect(screen.queryByText("Email failed")).toBeNull();
  });

  it("lists each email with its result and why it failed", async () => {
    get();
    render(<AffiliatesAdmin initial={[accepted]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    fireEvent.click(screen.getByRole("button", { name: /Sara Khan/ }));
    const d = within(screen.getByRole("dialog"));
    expect(await d.findByText(/Affiliate email is not set up/)).toBeTruthy();
    expect(d.getAllByText(/Welcome email/).length).toBe(2);
    expect(d.getByText("Failed")).toBeTruthy();
    expect(d.getByText("Sent")).toBeTruthy();
  });

  it("Clear history asks first, then clears only this person's emails", async () => {
    get();
    render(<AffiliatesAdmin initial={[accepted]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    fireEvent.click(screen.getByRole("button", { name: /Sara Khan/ }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.click(await d.findByRole("button", { name: /clear history/i }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    await waitFor(() => expect(fetchMock().mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(true));
    const del = fetchMock().mock.calls.find((c) => c[1]?.method === "DELETE")!;
    expect(del[0]).toBe("/api/admin/affiliates/emails?affiliateId=a2");
  });

  it("does not clear when the owner says no", async () => {
    get();
    confirmFn.mockResolvedValue(false);
    render(<AffiliatesAdmin initial={[accepted]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Affiliates" }));
    fireEvent.click(screen.getByRole("button", { name: /Sara Khan/ }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: /clear history/i }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetchMock().mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
  });

  it("a page-level button clears history older than 90 days after a yes", async () => {
    fetchMock().mockResolvedValue(reply(200, { ok: true, removed: 5 }));
    render(<AffiliatesAdmin initial={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /clear old email history/i }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/affiliates/emails?olderThanDays=90");
    expect(fetchMock().mock.calls[0][1].method).toBe("DELETE");
  });
});
