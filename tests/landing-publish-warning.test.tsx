import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { emptyContent, type LandingContent } from "@/lib/landing/content";
import type { LandingPage } from "@/lib/data/landing-pages";

const confirmMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmMock }));

import { PublishSlot } from "@/components/admin/landing/PublishSlot";

const A = "https://chat.whatsapp.com/AAAAAAAAAA";
const B = "https://chat.whatsapp.com/BBBBBBBBBB";

function content(a: string, b: string): LandingContent {
  const c = emptyContent("course");
  c.seo.description = "A short description.";
  c.settings.countdownFollowsEarlyBird = false;
  c.settings.registerUrl = "https://example.com/register";
  c.sections = [{ id: "s1", type: "rich_text", enabled: true, data: { heading: "About", body: "Some text." } }];
  c.registration = {
    ...c.registration,
    enabled: true,
    modes: ["live"],
    regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] }],
    defaultRegionKey: "PK",
    refPrefix: "TST",
    eventLabel: "Test Batch",
    whatsappVerifyNumber: "923001234567",
    options: [
      { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: a, moduleIds: [] },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: b, moduleIds: [] },
    ],
    prices: { full: { PK: { amount: 1000 } }, m1: { PK: { amount: 500 } } },
  };
  return c;
}

function pageFor(draft: LandingContent, published: LandingContent | null = null): LandingPage {
  return {
    id: "p1", slug: "demo-page", kind: "course", title: "Demo Page", status: published ? "published" : "draft",
    draft, published, revision: 1, publishedAt: null, createdAt: "", updatedAt: "", courseId: "c1", isMainPage: false,
  };
}

function mount(c: LandingContent, published: LandingContent | null = null) {
  return render(
    <PublishSlot page={pageFor(c, published)} title="Demo Page" versions={[]} content={c} saveState="saved" saveNow={async () => true} />,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  confirmMock.mockReset();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("publish warning popup", () => {
  it("shared-link warning shows a popup naming both options and blocks the request until confirmed", async () => {
    confirmMock.mockResolvedValue(false);
    mount(content(A, A));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    const opts = confirmMock.mock.calls[0][0];
    expect(opts.title).toBe("Two options use the same WhatsApp group");
    expect(opts.description).toContain("Full Course and Module 1");
    expect(opts.confirmLabel).toBe("Publish anyway");
    expect(opts.cancelLabel).toBe("Go back and fix");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("choosing Publish anyway sends the publish request", async () => {
    confirmMock.mockResolvedValue(true);
    mount(content(A, A));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-pages/p1/publish");
  });
  it("choosing Go back sends nothing", async () => {
    confirmMock.mockResolvedValue(false);
    mount(content(A, A));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("no warnings means no popup", async () => {
    mount(content(A, B));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(confirmMock).not.toHaveBeenCalled();
  });
  it('status text reads "Unpublished changes" when the draft differs from the published copy', () => {
    const published = content(A, B);
    const draft = content(A, B);
    draft.seo.title = "A new title";
    mount(draft, published);
    expect(screen.getByText("Unpublished changes")).toBeTruthy();
  });
});
