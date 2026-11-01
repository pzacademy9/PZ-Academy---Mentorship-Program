import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const hdrs = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: hdrs.get }) }));
const lim = vi.hoisted(() => ({ allowLookup: vi.fn(), allowPortalView: vi.fn() }));
vi.mock("@/lib/pzid/lookup-limit", () => lim);

import { callerAllowed, portalCallerAllowed } from "@/lib/pzid/caller-allowed";

beforeEach(() => {
  hdrs.get.mockReset().mockImplementation((n: string) => (n === "x-real-ip" ? "203.0.113.9" : null));
  lim.allowLookup.mockReset().mockResolvedValue(true);
  lim.allowPortalView.mockReset().mockResolvedValue(true);
});

describe("caller limits", () => {
  it("Find my ID uses the lookup limiter only", async () => {
    await callerAllowed();
    expect(lim.allowLookup).toHaveBeenCalledWith("203.0.113.9");
    expect(lim.allowPortalView).not.toHaveBeenCalled();
  });

  it("batch pages use the portal limiter only", async () => {
    await portalCallerAllowed();
    expect(lim.allowPortalView).toHaveBeenCalledWith("203.0.113.9");
    expect(lim.allowLookup).not.toHaveBeenCalled();
  });
});
