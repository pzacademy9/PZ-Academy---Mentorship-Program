import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({ runProgressEmails: vi.fn() }));
vi.mock("@/lib/data/affiliate-progress", () => ({ runProgressEmails: m.runProgressEmails }));

import { GET, maxDuration } from "@/app/api/cron/affiliate-progress/route";

const call = (headers: Record<string, string> = {}) => GET(new Request("http://x", { headers }) as never);

beforeEach(() => {
  m.runProgressEmails.mockReset();
  m.runProgressEmails.mockResolvedValue({ affiliates: 2, sent: 1, failed: 1, skipped: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/affiliate-progress", () => {
  it("cron route returns 401 without the secret, 401 when CRON_SECRET is unset, and the counts with it", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer " })).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    expect(m.runProgressEmails).not.toHaveBeenCalled();
    const ok = await call({ authorization: "Bearer s3cret" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ affiliates: 2, sent: 1, failed: 1, skipped: 0 });
  });
  it("returns 500 without details when the run throws", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    m.runProgressEmails.mockRejectedValue(new Error("secret detail"));
    const res = await call({ authorization: "Bearer s3cret" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
  it("allows 60 seconds", () => {
    expect(maxDuration).toBe(60);
  });
});
