// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  listUsers: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ auth: { admin: { listUsers: h.listUsers } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/lib/emails/enrollment", () => ({ sendEnrollmentEmail: vi.fn() }));
vi.mock("@/lib/gas/sheets-sync-client", () => ({ pushStatusToSheet: vi.fn() }));

import { resolveEmails } from "@/lib/data/admin-enrollments";

const MSG = "Could not look up student emails.";
const WANTED = "00000000-0000-4000-8000-0000000000aa";

function fullPage(prefix: string, extra?: { id: string; email: string | null }) {
  const users: { id: string; email: string | null }[] = Array.from({ length: 1000 }, (_, i) => ({ id: `${prefix}-${i}`, email: `${prefix}${i}@x.com` }));
  if (extra) users[0] = extra;
  return { data: { users }, error: null };
}

beforeEach(() => {
  h.listUsers.mockReset();
});

describe("resolveEmails strict mode", () => {
  it("throws on a listUsers error in strict mode, returns the partial map by default", async () => {
    h.listUsers.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(resolveEmails([WANTED], { strict: true })).rejects.toThrow(MSG);
    const map = await resolveEmails([WANTED]);
    expect(map.size).toBe(0);
  });

  it("throws when the 10-page cap is hit without finding the id (strict); default returns empty", async () => {
    h.listUsers.mockImplementation(async ({ page }: { page: number }) => fullPage(`p${page}`));
    await expect(resolveEmails([WANTED], { strict: true })).rejects.toThrow(MSG);
    expect(h.listUsers).toHaveBeenCalledTimes(10);

    h.listUsers.mockClear();
    const map = await resolveEmails([WANTED]);
    expect(map.size).toBe(0);
    expect(h.listUsers).toHaveBeenCalledTimes(10);
  });

  it("does not throw when the sweep finishes on a short page with the user having no email", async () => {
    h.listUsers.mockResolvedValue({ data: { users: [{ id: WANTED, email: null }] }, error: null });
    const map = await resolveEmails([WANTED], { strict: true });
    expect(map.size).toBe(0);
    expect(h.listUsers).toHaveBeenCalledTimes(1);
  });

  it("returns the email and stops early when found on a full page", async () => {
    h.listUsers.mockResolvedValue(fullPage("p1", { id: WANTED, email: "w@x.com" }));
    const map = await resolveEmails([WANTED], { strict: true });
    expect(map.get(WANTED)).toBe("w@x.com");
    expect(h.listUsers).toHaveBeenCalledTimes(1);
  });
});
