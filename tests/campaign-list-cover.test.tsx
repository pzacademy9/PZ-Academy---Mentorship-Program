import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CampaignList } from "@/components/admin/registrations/CampaignList";
import type { Campaign } from "@/lib/data/participant-campaigns";

const SUPA = "https://abcdefgh.supabase.co";
const camp = (over: Partial<Campaign> = {}): Campaign => ({
  pageId: "pg1", title: "Alpha Batch", pageStatus: "published", total: 2,
  counts: { pending: 1, reserved: 0, underpaid: 0, paid: 1, free: 0 }, coverUrl: null, ...over,
});

describe("campaign card cover", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  });

  it("shows the cover image or a letter placeholder, and both cards still link to their campaign", () => {
    const url = `${SUPA}/storage/v1/object/public/media/a.png`;
    const { container } = render(
      <CampaignList campaigns={[camp({ coverUrl: url }), camp({ pageId: "pg2", title: "Beta Batch", coverUrl: null })]} />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe(url);
    const a = screen.getByRole("link", { name: /Alpha Batch/ });
    const b = screen.getByRole("link", { name: /Beta Batch/ });
    expect(a.getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/campaign/pg1");
    expect(b.getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/campaign/pg2");
    expect(within(b).getByText("B")).toBeTruthy();
    expect(within(b).queryByRole("img")).toBeNull();
    expect(within(a).getByText("Open campaign")).toBeTruthy();
  });
});
