// Dates must print in Pakistan time whatever zone the machine is in, so the
// server (UTC) and the browser agree. Run under TZ=UTC and TZ=Asia/Karachi.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import { CohortDetailClient } from "@/components/admin/crm/CohortDetailClient";
import type { CohortRow, CohortDetail } from "@/lib/data/admin-crm-import";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

// 20:30 UTC on 12 Oct is already 01:30 on 13 Oct in Pakistan.
const CREATED = "2026-10-12T20:30:00.000Z";

const row: CohortRow = {
  id: "c1", sheetName: "DIT Batch 1", tabName: "Tab A", rowsImported: 10, createdAt: CREATED,
  courseId: null, courseTitle: "DIT", purchaseCount: 10, kind: "imported", contactCount: 10,
};
const detail: CohortDetail = { ...row, contacts: [] };

function datesAreInPakistanTime() {
  it("CohortsPanel prints the Pakistan date", () => {
    const { container } = render(<CohortsPanel initialCohorts={[row]} />);
    expect(container.textContent).toContain("13 Oct 2026");
    expect(container.textContent).not.toContain("12 Oct 2026");
  });

  it("CohortDetailClient prints the Pakistan date", () => {
    const { container } = render(<CohortDetailClient cohort={detail} />);
    expect(container.textContent).toContain("13 Oct 2026");
    expect(container.textContent).not.toContain("12 Oct 2026");
  });
}

describe("cohort dates are pinned to Pakistan time (machine in UTC)", () => {
  beforeAll(() => { process.env.TZ = "UTC"; });
  datesAreInPakistanTime();
});

describe("cohort dates are pinned to Pakistan time (machine in Asia/Karachi)", () => {
  beforeAll(() => { process.env.TZ = "Asia/Karachi"; });
  datesAreInPakistanTime();
});
