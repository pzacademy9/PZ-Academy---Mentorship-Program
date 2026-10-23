// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const NAME = "Notes \u2013 \u201cWeek 1\u201d \u0627\u0631\u062f\u0648.pdf";

const supabase = vi.hoisted(() => ({ documents: [] as unknown[] }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { documents: supabase.documents } }) }),
      }),
    }),
  }),
}));

describe("module document route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GAS_SHEETS_SYNC_URL", "https://gas.example/exec");
    vi.stubEnv("GAS_SHARED_SECRET", "s");
    supabase.documents = [{ fileId: "f1", name: NAME }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, base64: Buffer.from("hi").toString("base64"), mimeType: "application/pdf" }),
      })),
    );
  });

  it("serves a document whose name has non-Latin-1 characters", async () => {
    const { GET } = await import("@/app/api/modules/[id]/documents/[fileId]/route");
    const res = await GET({} as never, { params: Promise.resolve({ id: "m1", fileId: "f1" }) });
    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition")!;
    expect(cd).toMatch(/^inline; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
    expect(cd).toContain(encodeURIComponent(NAME));
  });
});
