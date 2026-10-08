import { render, screen, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { WhatsAppPanel } from "@/components/admin/crm/WhatsAppPanel";
import { WhatsAppBatchDetailClient } from "@/components/admin/crm/WhatsAppBatchDetailClient";
import type { WhatsAppBatchDetail, WhatsAppBatchListRow } from "@/lib/data/admin-crm-whatsapp";

vi.mock("@/components/admin/crm/SegmentBuilder", () => ({ SegmentBuilder: () => null }));
vi.mock("@/components/admin/crm/TemplatePicker", () => ({ TemplatePicker: () => null }));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ courses: [] }) })));
});

const row = (over: Partial<WhatsAppBatchListRow> = {}): WhatsAppBatchListRow => ({
  id: "b-admin", name: "Admin batch", messageTemplate: "Hi {{first_name}}", recipientCount: 4, sentCount: 1,
  createdAt: "2026-10-01T10:00:00Z", conversionTag: { kind: "none" }, conversionCourseTitle: null, conversion: null,
  ownerAgentId: null, ownerAgentName: null, status: "active", ...over,
});

const recipients: WhatsAppBatchDetail["recipients"] = (["pending", "sent", "skipped", "blocked"] as const).map((s, i) => ({
  id: `r${i}`, contactId: `c${i}`, fullName: `Person ${s}`, phoneE164: `+92300000000${i}`, status: s,
  sentAt: s === "sent" ? "2026-10-02T10:00:00Z" : null, convertedAt: null, doNotContact: false,
}));

const detail = (over: Partial<WhatsAppBatchDetail> = {}): WhatsAppBatchDetail => ({
  ...row(), segment: [], recipients, pausedReason: null, ...over,
});

const agentOver = { id: "b-agent", name: "Agent campaign", ownerAgentId: "agent-1", ownerAgentName: "Sara Agent", status: "paused" };

describe("WhatsAppPanel", () => {
  it("shows owner and status chip for an agent campaign only", () => {
    render(<ConfirmProvider><WhatsAppPanel initialBatches={[row(), row(agentOver)]} /></ConfirmProvider>);
    expect(screen.getByText("by Sara Agent")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryAllByText(/^by /)).toHaveLength(1);
  });

  it("agent campaign rows keep Delete but not Duplicate; admin rows keep both", () => {
    render(<ConfirmProvider><WhatsAppPanel initialBatches={[row(), row(agentOver)]} /></ConfirmProvider>);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Duplicate" })).toHaveLength(1);
  });
});

describe("WhatsAppBatchDetailClient", () => {
  it("agent campaign is read-only with a banner, progress and worded statuses", () => {
    const { container } = render(<WhatsAppBatchDetailClient initialDetail={detail(agentOver)} manualConvertedContactIds={[]} />);
    expect(screen.getByText("Run by Sara Agent. You can watch progress here; sending happens in their workspace.")).toBeTruthy();
    expect(container.querySelector('a[href^="whatsapp://"]')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(screen.queryByText("Edit batch")).toBeNull();
    expect(screen.queryByText("Edit message")).toBeNull();
    expect(screen.queryByText(/Switch to queue mode/)).toBeNull();
    expect(screen.queryByText("Open chat")).toBeNull();
    expect(screen.getAllByText("1 / 4 sent").length).toBeGreaterThan(0);
    for (const s of ["pending", "sent", "skipped", "blocked"]) {
      expect(screen.getAllByText(`Person ${s}`).length).toBeGreaterThan(0);
      const table = container.querySelector("table")!;
      expect(within(table).getAllByText(s, { exact: true }).length).toBeGreaterThan(0);
    }
  });

  it("admin batch renders exactly as before (regression)", () => {
    const { container } = render(
      <WhatsAppBatchDetailClient initialDetail={detail({ recipients: recipients.slice(0, 2) })} manualConvertedContactIds={[]} />,
    );
    expect(screen.queryByText(/^Run by /)).toBeNull();
    expect(screen.getByText("Edit batch")).toBeTruthy();
    expect(screen.getByText("Edit message")).toBeTruthy();
    expect(screen.getByText("Switch to queue mode")).toBeTruthy();
    expect(container.querySelectorAll('a[href^="whatsapp://"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
  });
});
