import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ rpc }) }));

import { findAccountIdByEmail } from "@/lib/data/mentor-accounts";

describe("findAccountIdByEmail", () => {
  it("returns the id, or null when there is no account", async () => {
    rpc.mockResolvedValueOnce({ data: "u1", error: null });
    expect(await findAccountIdByEmail("a@test.dev")).toBe("u1");
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await findAccountIdByEmail("b@test.dev")).toBeNull();
  });
  it("throws when the lookup itself fails, so a failure is never mistaken for 'no account'", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(findAccountIdByEmail("c@test.dev")).rejects.toThrow();
  });
});
