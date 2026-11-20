// tests/messages-history.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MessagesHistory } from "@/components/admin/registrations/MessagesHistory";
import { MessagesSentList } from "@/components/admin/registrations/MessagesSentList";
import { CampaignRegistrations } from "@/components/admin/registrations/CampaignRegistrations";
import type { SendListItem } from "@/lib/data/participant-sends";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/x", useSearchParams: () => new URLSearchParams() }));

const send = (over: Partial<SendListItem> = {}): SendListItem => ({
  id: "s1", page_id: "pg1", channel: "email", subject: "Module 2 Schedule", body: "Hello there", template_id: null,
  recipient_count: 12, not_paid_count: 0, not_paid_confirmed: false, created_by: "u1", created_at: "2026-10-15T11:42:00Z",
  senderName: "Sarah Jenkins", counts: { sent: 9, failed: 2, skipped: 1, waiting: 0 }, ...over,
} as SendListItem);

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); document.body.style.overflow = ""; });

const icon = () => screen.getByRole("button", { name: /^Messages sent/ });

describe("MessagesHistory", () => {
  it("shows only the icon at first, with a count badge when there are sends", () => {
    render(<MessagesHistory sends={[send(), send({ id: "s2" })]} />);
    expect(icon()).toBeTruthy();
    expect(screen.getByTestId("history-badge").textContent).toBe("2");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Messages sent" })).toBeNull();
  });

  it("has no badge when nothing was sent", () => {
    render(<MessagesHistory sends={[]} />);
    expect(screen.queryByTestId("history-badge")).toBeNull();
  });

  it("opens the panel on click, locks scroll, and Escape closes it and returns focus", () => {
    render(<MessagesHistory sends={[send()]} />);
    fireEvent.click(icon());
    expect(screen.getByRole("dialog", { name: "Messages sent" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Messages sent" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(icon());
  });

  it("closes with the Close button and with the backdrop", () => {
    render(<MessagesHistory sends={[]} />);
    fireEvent.click(icon());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(icon());
    fireEvent.click(screen.getByTestId("history-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores scroll when it unmounts while open", () => {
    const { unmount } = render(<MessagesHistory sends={[]} />);
    fireEvent.click(icon());
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("View details still opens inside the panel; Escape closes the details first, then the panel", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ send: send(), recipients: [], refIds: {}, portalUrl: null }) });
    render(<MessagesHistory sends={[send()]} />);
    fireEvent.click(icon());
    fireEvent.click(screen.getByRole("button", { name: /Module 2 Schedule/ }));
    expect(await screen.findByText("Message details")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Message details")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Messages sent" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CampaignRegistrations history slot", () => {
  it("renders the history slot beside Filters and no list at the bottom", () => {
    render(
      <CampaignRegistrations
        pageId="pg1" pageTitle="TMC Batch 1" rows={[]} total={0}
        counts={{ all: 0, pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 }}
        basePath="/b" detailHrefBase="/d" filters={{ pageId: "pg1" }} query={{}}
        filterOptions={{ regions: [], optionLabels: [] }}
        historySlot={<MessagesHistory sends={[send()]} />}
      />,
    );
    expect(icon()).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Messages sent" })).toBeNull();
    fireEvent.click(icon());
    expect(screen.getByRole("heading", { name: "Messages sent" })).toBeTruthy();
  });
});

describe("MessagesSentList compact", () => {
  const rowButton = () => screen.getByRole("button", { name: /Module 2 Schedule/ });
  it("stays stacked at every width with compact, side by side without it", () => {
    const { unmount } = render(<MessagesSentList sends={[send()]} compact />);
    expect(rowButton().className).not.toContain("lg:flex-row");
    unmount();
    render(<MessagesSentList sends={[send()]} />);
    expect(rowButton().className).toContain("lg:flex-row");
  });

  it("the panel uses the compact list", () => {
    render(<MessagesHistory sends={[send()]} />);
    fireEvent.click(icon());
    expect(rowButton().className).not.toContain("lg:flex-row");
  });
});
