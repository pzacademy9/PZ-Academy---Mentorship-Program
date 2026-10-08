import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { CampaignsList } from "@/components/sales/CampaignsList";
import type { CampaignListItemJson } from "@/lib/crm/campaign-ui";

const camp = (id: string, name: string, over: Partial<CampaignListItemJson> = {}): CampaignListItemJson => ({
  id, name, status: "active", recipientCount: 10, sentCount: 4, pendingCount: 6,
  pausedReason: null, createdAt: "2026-10-01T10:00:00Z", ...over,
});

function mockList(campaigns: CampaignListItemJson[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ campaigns }) })));
}
const renderList = () => render(<ConfirmProvider><CampaignsList /></ConfirmProvider>);

beforeEach(() => vi.unstubAllGlobals());

describe("CampaignsList", () => {
  it("the loading skeleton is announced", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderList();
    expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy();
  });

  it("renders name, progress text and status chips", async () => {
    mockList([
      camp("a", "Spring follow-up"),
      camp("b", "Old batch", { status: "paused", pausedReason: "Daily limit reached", sentCount: 2 }),
      camp("c", "Finished batch", { status: "done", sentCount: 10, pendingCount: 0 }),
    ]);
    renderList();
    expect(await screen.findByText("Spring follow-up")).toBeTruthy();
    expect(screen.getByText("4 of 10 sent")).toBeTruthy();
    expect(screen.getByText("2 of 10 sent")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Daily limit reached")).toBeTruthy();
  });

  it("non-done campaigns link Resume, done ones link View", async () => {
    mockList([camp("a", "One"), camp("c", "Three", { status: "done" })]);
    renderList();
    const resume = await screen.findByRole("link", { name: /Resume/ });
    expect(resume.getAttribute("href")).toBe("/dashboard/sales/campaigns/a");
    expect(screen.getByRole("link", { name: /View/ }).getAttribute("href")).toBe("/dashboard/sales/campaigns/c");
  });

  it("the header always links New campaign", async () => {
    mockList([camp("a", "One")]);
    renderList();
    const link = await screen.findByRole("link", { name: "New campaign" });
    expect(link.getAttribute("href")).toBe("/dashboard/sales/campaigns/new");
  });

  it("shows an empty state with a New campaign action", async () => {
    mockList([]);
    renderList();
    expect(await screen.findByText("No campaigns yet.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "New campaign" });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.getAttribute("href")).toBe("/dashboard/sales/campaigns/new");
  });

  it("a failed load shows an error and Retry reloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaigns: [camp("a", "One")] }) });
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    expect(await screen.findByText(/couldn.t load your campaigns/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("One")).toBeTruthy());
  });
});
