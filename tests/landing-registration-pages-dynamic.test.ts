import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// These pages show a payment status that changes from a dialog; they must never be cached.
const PAGES = [
  "src/app/dashboard/admin/enrollments/registrations/page.tsx",
  "src/app/dashboard/admin/enrollments/registrations/[id]/page.tsx",
  "src/app/dashboard/admin/enrollments/registrations/all/page.tsx",
  "src/app/dashboard/sales/registrations/page.tsx",
  "src/app/dashboard/sales/registrations/[id]/page.tsx",
  "src/app/dashboard/admin/enrollments/registrations/all/page.tsx",
];

describe("registration pages are never cached", () => {
  for (const p of PAGES) {
    it(p, () => {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
      expect(src).toMatch(/export const fetchCache = "force-no-store"/);
    });
  }
});
