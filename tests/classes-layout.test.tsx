import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({ addSession: vi.fn(), saveSession: vi.fn(), setOverride: vi.fn(), sendReminderNow: vi.fn(), emailUpdatedTime: vi.fn(), resendClassDetails: vi.fn(), markEveryonePresent: vi.fn(), toggleMark: vi.fn(), saveMinPct: vi.fn(), removeSession: vi.fn(), emailFeedbackLink: vi.fn(), sendTestEmailToMe: vi.fn(), emailMissingOnly: vi.fn(), emailNewZoomLink: vi.fn(), openProgramReport: vi.fn(), loadClassEmailHistory: vi.fn(async () => ({ ok: true, rounds: [] })) }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions", () => ({ createMissingFeedbackAction: vi.fn() }));

import { SessionsPanel } from "@/components/admin/attendance/SessionsPanel";
import { BatchSummary } from "@/components/admin/classes/BatchSummary";
import { summarizeFeedback } from "@/lib/classes/summary";
import type { ClassSummary, ClassOverview } from "@/lib/data/class-overview";
import type { SessionRow } from "@/lib/data/attendance";

const PAGE = "00000000-0000-4000-8000-000000000001";
const cls: ClassSummary = {
  id: "s1", number: 1, title: "Intro", speaker: "Dr A",
  startsAt: "2026-11-10T14:00:00.000Z", endsAt: "2026-11-10T16:00:00.000Z",
  status: "today", presentCount: 1, enrolledLive: 2,
  attendanceLink: "https://x.test/attend/code0001", feedbackLink: null, feedbackSessionId: null,
  feedbackCount: 0, feedbackAvg: null, quiz: { saved: false, players: 0 },
};
const session = {
  id: "s1", page_id: PAGE, number: 1, title: "Intro", speaker: "Dr A",
  starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z",
  zoom_url: "", kahoot_url: "", include_kahoot: false, include_attendance_link: true,
  email_enabled: true, email_lead_minutes: 60, public_code: "code0001", window_override: "auto",
  custom_time: false, custom_zoom: false, feedback_session_id: null,
  quiz_file_name: null, quiz_max_score: null, quiz_saved_at: null, created_at: null,
} as unknown as SessionRow;
const overview: ClassOverview = {
  title: "Batch", slug: "batch", classes: [cls], selectedId: "s1",
  batchFeedback: { totalResponses: 0, overallAvg: null, perClass: [] }, programId: null,
};

describe("Classes page layout", () => {
  it("the PC grid uses a shrinkable column and the class panel column can shrink", () => {
    render(<SessionsPanel pageId={PAGE} overview={overview} sessions={[session]} rows={[]} minPct={75} sends={{}} nowIso="2026-11-10T07:00:00.000Z" pageStatus="published" showInPortal={null} />);
    const grid = screen.getByRole("button", { name: /Day 1/ }).closest("div.grid")!;
    expect(grid.className).toContain("minmax(0,1fr)");
    const right = screen.getByRole("tabpanel").closest("div.grid > div:not(:first-child)") as HTMLElement;
    expect(right.className).toContain("min-w-0");
  });

  it("the batch summary starts collapsed", () => {
    render(<BatchSummary pageId="pg" rows={[]} minPct={75} feedback={summarizeFeedback([])} programId={null} />);
    const details = screen.getByText("Batch results").closest("details")!;
    expect(details.open).toBe(false);
  });
});
