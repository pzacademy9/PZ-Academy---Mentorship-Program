import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CohortDetailClient } from "@/components/admin/crm/CohortDetailClient";
import type { CohortDetail } from "@/lib/data/admin-crm-import";

const detail = (over: Partial<CohortDetail> = {}): CohortDetail => ({
  id: "c1", sheetName: "DIT Batch 1", tabName: "Tab A", rowsImported: 10, createdAt: "2026-10-01T10:00:00Z",
  courseId: null, courseTitle: "DIT", purchaseCount: 10, kind: "imported", contactCount: 10, contacts: [], ...over,
});

describe("cohort detail header", () => {
  it("imported cohorts still show rows still attached", () => {
    render(<CohortDetailClient cohort={detail({ purchaseCount: 8, rowsImported: 10 })} />);
    expect(screen.getByText(/8 of 10 rows still attached/)).toBeTruthy();
  });

  it("interested cohorts show a people count instead of rows attached", () => {
    render(<CohortDetailClient cohort={detail({ kind: "closed_interested", purchaseCount: 0, rowsImported: 42, contactCount: 42 })} />);
    expect(screen.getByText(/42 people/)).toBeTruthy();
    expect(screen.queryByText(/rows still attached/)).toBeNull();
  });

  it("interested cohort of one person is singular", () => {
    render(<CohortDetailClient cohort={detail({ kind: "closed_interested", purchaseCount: 0, rowsImported: 1, contactCount: 1 })} />);
    expect(screen.getByText(/1 person\b/)).toBeTruthy();
  });
});
