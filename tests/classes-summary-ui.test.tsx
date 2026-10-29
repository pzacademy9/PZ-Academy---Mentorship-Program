import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ open: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.error } }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions", () => ({
  openProgramReport: h.open,
}));

import { BatchSummary } from "@/components/admin/classes/BatchSummary";
import { summarizeFeedback } from "@/lib/classes/summary";
import type { GridRow } from "@/lib/data/attendance";

const row = (pct: number | null, id: string): GridRow => ({
  personId: id, pzId: id, name: id, marks: {}, started: pct === null ? 0 : 4, marked: 0, pct, meetsMin: false,
});
const none = summarizeFeedback([{ number: 1, responses: 0, avg: null }]);
const some = summarizeFeedback([
  { number: 1, responses: 12, avg: 4.8 },
  { number: 2, responses: 8, avg: 4 },
]);
const props = { pageId: "pg", rows: [] as GridRow[], minPct: 75 };

let winOpen: ReturnType<typeof vi.fn>;
beforeEach(() => {
  h.open.mockReset();
  h.error.mockReset();
  winOpen = vi.fn();
  vi.stubGlobal("open", winOpen);
});
afterEach(() => vi.unstubAllGlobals());

describe("BatchSummary", () => {
  it("shows No feedback yet when there are no responses", () => {
    render(<BatchSummary {...props} feedback={none} programId={null} />);
    expect(screen.getByText("No feedback yet")).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
    expect(screen.getByText("No classes held yet")).toBeTruthy();
  });

  it("shows the combined feedback button and warning when a program exists", () => {
    render(<BatchSummary {...props} feedback={some} programId="prog1" />);
    expect(screen.getByRole("button", { name: /Open combined feedback report/ })).toBeTruthy();
    expect(screen.getByText(/anyone with the link can read.*names and comments/)).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText(/Day 1/)).toBeTruthy();
    expect(screen.getByText(/20 responses/)).toBeTruthy();
  });

  it("shows no program button for a webinar", () => {
    render(<BatchSummary {...props} feedback={summarizeFeedback([{ number: 1, responses: 5, avg: 4.2 }])} programId={null} />);
    expect(screen.queryByRole("button", { name: /combined feedback report/ })).toBeNull();
    expect(screen.queryByText(/anyone with the link/)).toBeNull();
    expect(screen.getByText("4.2")).toBeTruthy();
  });

  it("clicking calls the action and opens the path in a new tab", async () => {
    h.open.mockResolvedValue({ ok: true, path: "/review/tok" });
    render(<BatchSummary {...props} feedback={some} programId="prog1" />);
    fireEvent.click(screen.getByRole("button", { name: /Open combined feedback report/ }));
    await waitFor(() => expect(winOpen).toHaveBeenCalledWith("/review/tok", "_blank", "noopener,noreferrer"));
    expect(h.open).toHaveBeenCalledWith("pg");
  });

  it("shows the message as a toast when the action refuses", async () => {
    h.open.mockResolvedValue({ ok: false, message: "This batch has no combined report" });
    render(<BatchSummary {...props} feedback={some} programId="prog1" />);
    fireEvent.click(screen.getByRole("button", { name: /Open combined feedback report/ }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("This batch has no combined report"));
    expect(winOpen).not.toHaveBeenCalled();
  });

  it("shows attendance average and certificate count", () => {
    render(
      <BatchSummary {...props} feedback={none} programId={null} rows={[row(100, "a"), row(80, "b"), row(50, "c"), row(70, "d")]} />,
    );
    expect(screen.getByText(/Average attendance 75%/)).toBeTruthy();
    expect(screen.getByText(/2 of 4 students meet the 75% minimum for a certificate/)).toBeTruthy();
  });
});
