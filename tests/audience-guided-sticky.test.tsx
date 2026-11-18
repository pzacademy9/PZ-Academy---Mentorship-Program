// tests/audience-guided-sticky.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudiencesPanel } from "@/components/admin/crm/AudiencesPanel";
import type { AudienceFacets } from "@/lib/data/audience-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/admin/crm/BringInDialog", () => ({ BringInDialog: () => null }));

const facets: AudienceFacets = {
  courses: [],
  countries: [],
  unknownCountry: 0,
  landingPages: [],
  statusCounts: {},
  needsUpdate: false,
  statusNeedsUpdate: false,
};

describe("Audiences summary card stickiness", () => {
  it("sits below the 4rem top bar on PC (lg:top-20, not lg:top-4)", () => {
    render(<AudiencesPanel facets={facets} saved={[]} needsUpdate={false} />);
    const next = screen.getByRole("button", { name: /Next: Check the list/ });
    const sticky = next.closest(".sticky");
    expect(sticky).not.toBeNull();
    const cls = sticky!.className.split(/\s+/);
    expect(cls).toContain("lg:top-20");
    expect(cls).not.toContain("lg:top-4");
  });
});
