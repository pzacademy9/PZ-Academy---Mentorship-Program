// tests/participant-campaign-list-ui.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CampaignList } from "@/components/admin/registrations/CampaignList";
import type { Campaign } from "@/lib/data/participant-campaigns";

const camp = (over: Partial<Campaign> = {}): Campaign => ({
  pageId: "pg1", title: "TMC Batch 1", pageStatus: "published", total: 7,
  counts: { pending: 3, reserved: 1, underpaid: 0, paid: 2, free: 1 }, ...over,
});

describe("campaign list UI", () => {
  it("shows title, status counts and links to the campaign page", () => {
    render(<CampaignList campaigns={[camp()]} />);
    const link = screen.getByRole("link", { name: /TMC Batch 1/ });
    expect(link.getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/campaign/pg1");
    expect(within(link).getByText("Live")).toBeTruthy();
    expect(within(link).getByText("7")).toBeTruthy();
    expect(within(link).getByText("3 pending")).toBeTruthy();
    expect(within(link).getByText("2 paid")).toBeTruthy();
  });

  it("shows 0 paid rather than blank, and friendly page states", () => {
    render(<CampaignList campaigns={[camp({ pageStatus: "draft", counts: { pending: 1, reserved: 0, underpaid: 0, paid: 0, free: 0 }, total: 1 }),
      camp({ pageId: "pg2", title: "Old", pageStatus: "closed" })]} />);
    expect(screen.getByText("0 paid")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
  });

  it("links to all registrations", () => {
    render(<CampaignList campaigns={[camp()]} />);
    expect(screen.getByRole("link", { name: /All registrations/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations/all");
  });

  it("has an empty state that still links to all registrations", () => {
    render(<CampaignList campaigns={[]} />);
    expect(screen.getByText("No campaigns yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All registrations/ })).toBeTruthy();
  });
});
