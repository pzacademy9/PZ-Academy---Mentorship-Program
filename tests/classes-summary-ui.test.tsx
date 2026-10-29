import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("BatchSummary", () => {
  it("shows No feedback yet when there are no responses", () => {
    render(<BatchSummary feedback={none} reviewPath={null} rows={[]} minPct={75} />);
    expect(screen.getByText("No feedback yet")).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
    expect(screen.getByText("No classes held yet")).toBeTruthy();
  });

  it("shows the combined feedback link when a program exists", () => {
    render(<BatchSummary feedback={some} reviewPath="/review/tok" rows={[]} minPct={75} />);
    const link = screen.getByRole("link", { name: /combined feedback report/i });
    expect(link.getAttribute("href")).toBe("/review/tok");
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText(/Day 1/)).toBeTruthy();
    expect(screen.getByText(/20 responses/)).toBeTruthy();
  });

  it("shows no program link for a webinar", () => {
    render(<BatchSummary feedback={summarizeFeedback([{ number: 1, responses: 5, avg: 4.2 }])} reviewPath={null} rows={[]} minPct={75} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("4.2")).toBeTruthy();
  });

  it("shows attendance average and certificate count", () => {
    render(
      <BatchSummary feedback={none} reviewPath={null} rows={[row(100, "a"), row(80, "b"), row(50, "c"), row(70, "d")]} minPct={75} />,
    );
    expect(screen.getByText(/Average attendance 75%/)).toBeTruthy();
    expect(screen.getByText(/2 of 4 students meet the 75% minimum for a certificate/)).toBeTruthy();
  });
});
