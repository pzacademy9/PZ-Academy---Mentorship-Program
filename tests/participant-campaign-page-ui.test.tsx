// tests/participant-campaign-page-ui.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { CampaignRegistrations } from "@/components/admin/registrations/CampaignRegistrations";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";
import { RegistrationFilters } from "@/components/admin/registrations/RegistrationFilters";
import { registrationHref } from "@/components/admin/registrations/query";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (i: number, over: Partial<RegistrationListRow> = {}): RegistrationListRow => ({
  id: `r${i}`, refId: null, name: `Person ${i}`, email: `p${i}@x.com`, pageId: "pg1", pageTitle: "TMC Batch 1",
  optionLabel: "Full course", mode: "live", region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR",
  status: "paid", agentId: null, agentName: null, groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null,
  voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false, lastEmailAt: {}, ...over,
});
const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
const counts = { all: 57, pending: 10, reserved: 5, underpaid: 2, paid: 35, free: 5 };

function setup(over: Partial<Parameters<typeof CampaignRegistrations>[0]> = {}) {
  const onOpenBuilder = vi.fn();
  render(
    <CampaignRegistrations
      pageId="pg1" pageTitle="TMC Batch 1" rows={rows} total={57} pageSize={25} counts={counts}
      basePath="/dashboard/admin/enrollments/registrations/campaign/pg1"
      detailHrefBase="/dashboard/admin/enrollments/registrations"
      filters={{ pageId: "pg1", status: "paid" }} query={{ status: "paid" }}
      filterOptions={{ regions: ["PK", "SA"], optionLabels: ["Full course"] }}
      onOpenBuilder={onOpenBuilder}
      messagesSlot={<div>messages here</div>}
      {...over}
    />,
  );
  return { onOpenBuilder };
}
const tbl = () => within(screen.getByRole("table"));
const headerBox = () => tbl().getByRole("checkbox", { name: "Select all on this page" }) as HTMLInputElement;
const rowBoxes = () => tbl().getAllByRole("checkbox").filter((c) => c !== headerBox()) as HTMLInputElement[];

describe("campaign page", () => {
  it("uses the campaign name as the heading, with a back link and the messages slot", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("TMC Batch 1");
    expect(screen.getByRole("link", { name: /All campaigns/ }).getAttribute("href")).toBe("/dashboard/admin/enrollments/registrations");
    expect(screen.getByText("messages here")).toBeTruthy();
  });

  it("shows no send bar until something is ticked", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Send email" })).toBeNull();
    fireEvent.click(rowBoxes()[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send WhatsApp" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("button", { name: "Send email" })).toBeNull();
  });

  it("header checkbox ticks the visible rows and offers all in the filter", () => {
    setup();
    fireEvent.click(headerBox());
    expect(rowBoxes().every((c) => c.checked)).toBe(true);
    expect(screen.getByText("25 selected")).toBeTruthy();
    expect(screen.getByText(/All 25 on this page are selected\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select all 57 in this filter" })).toBeTruthy();
  });

  it("select all in this filter switches to filter mode and shows 57", () => {
    const { onOpenBuilder } = setup();
    fireEvent.click(headerBox());
    fireEvent.click(screen.getByRole("button", { name: "Select all 57 in this filter" }));
    expect(screen.getByText("57 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send WhatsApp" }));
    expect(onOpenBuilder).toHaveBeenCalledWith("whatsapp", {
      pageId: "pg1", pageTitle: "TMC Batch 1", count: 57,
      selection: { mode: "filter", filters: { pageId: "pg1", status: "paid" } },
    });
  });

  it("unticking one row leaves filter mode", () => {
    const { onOpenBuilder } = setup();
    fireEvent.click(headerBox());
    fireEvent.click(screen.getByRole("button", { name: "Select all 57 in this filter" }));
    fireEvent.click(rowBoxes()[0]);
    expect(screen.getByText("24 selected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select all 57 in this filter" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    const [channel, req] = onOpenBuilder.mock.calls[0];
    expect(channel).toBe("email");
    expect(req.count).toBe(24);
    expect(req.selection.mode).toBe("ids");
    expect(req.selection.ids).toHaveLength(24);
    expect(req.selection.ids).not.toContain("r1");
  });

  it("has Country and What they bought filters but no Page filter", () => {
    setup();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.getByLabelText("What they bought")).toBeTruthy();
    expect(screen.queryByLabelText("Page")).toBeNull();
  });
});

describe("other registration lists", () => {
  it("the plain table renders no checkboxes", () => {
    render(
      <RegistrationsTable rows={rows} total={25} pageSize={25} basePath="/x" filters={{}} detailHrefBase="/d" showAgentColumn={false} />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("the filter bar has no Country or What they bought unless asked", () => {
    render(<RegistrationFilters basePath="/x" filters={{}} counts={counts} pageOptions={[]} />);
    expect(screen.queryByLabelText("Country")).toBeNull();
  });
  it("links keep region and optionLabel", () => {
    const sp = new URLSearchParams(registrationHref("/x", { region: "PK", optionLabel: "Full course" }).split("?")[1]);
    expect(sp.get("region")).toBe("PK");
    expect(sp.get("optionLabel")).toBe("Full course");
  });
});

describe("PZ ID column and batch ID tools", () => {
  it("shows the PZ ID, and a dash for a row with no person", () => {
    setup({
      rows: [row(1, { pzId: "Hamid-4821" }), row(2, { status: "pending", pzId: null })],
      total: 2, publicSlug: "ppc-batch-1",
    });
    expect(tbl().getByRole("columnheader", { name: "PZ ID" })).toBeTruthy();
    expect(tbl().getByText("Hamid-4821")).toBeTruthy();
    expect(tbl().getByLabelText("No PZ ID yet")).toBeTruthy();
  });
  it("has the download and copy-link buttons", () => {
    setup({ publicSlug: "ppc-batch-1" });
    expect(screen.getByRole("button", { name: "Download ID list (PDF)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy public ID page link" })).toBeTruthy();
  });
  it("hides the copy-link button when the page has no public link (draft)", () => {
    setup({ publicSlug: null });
    expect(screen.getByRole("button", { name: "Download ID list (PDF)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy public ID page link" })).toBeNull();
  });
  it("copies the public ID page link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup({ publicSlug: "ppc-batch-1" });
    fireEvent.click(screen.getByRole("button", { name: "Copy public ID page link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ids/ppc-batch-1`);
  });
});
