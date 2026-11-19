// tests/portal-access-entry.test.tsx
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

describe("portal access entry point", () => {
  it("the campaign page header links Portal access to .../campaign/<id>/portal", () => {
    const src = readFileSync(
      "src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx",
      "utf8",
    );
    expect(src).toContain("href={`${DETAIL_BASE}/campaign/${pageId}/portal`}");
    expect(src).toMatch(/\/portal`\}[\s\S]{0,300}Portal access/);
  });

  it("the old /access page redirects to the Registrations list", async () => {
    const mod = await import("@/app/dashboard/admin/enrollments/registrations/access/page");
    expect(() => mod.default()).toThrow("REDIRECT:/dashboard/admin/enrollments/registrations");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/admin/enrollments/registrations");
  });

  it("no page links to the old Batch access screen any more", () => {
    for (const f of [
      "src/components/admin/registrations/CampaignList.tsx",
      "src/app/dashboard/admin/enrollments/registrations/all/page.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("Batch access");
      expect(src).not.toContain("/registrations/access");
    }
  });
});
