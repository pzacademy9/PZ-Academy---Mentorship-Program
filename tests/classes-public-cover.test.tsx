import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/components/attendance/CheckinForm", () => ({ CheckinForm: () => null }));
vi.mock("@/app/attend/[code]/actions", () => ({ checkInPersonal: vi.fn(), checkInShared: vi.fn() }));

const getSessionByCode = vi.fn();
vi.mock("@/lib/data/attendance", () => ({
  getSessionByCode: (...a: unknown[]) => getSessionByCode(...a),
  personFirstName: vi.fn(),
}));

import AttendPage from "@/app/attend/[code]/page";

const session = (coverUrl: string | null) => ({
  id: "s1", page_id: "pg1", starts_at: new Date().toISOString(), window_override: "auto",
  public_code: "abcd1234", title: "Class 1", batchTitle: "Batch A", coverUrl,
});

async function html(coverUrl: string | null) {
  getSessionByCode.mockResolvedValue(session(coverUrl));
  const el = await AttendPage({ params: Promise.resolve({ code: "abcd1234" }), searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  getSessionByCode.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
});

describe("attendance page cover", () => {
  it("attendance page shows the cover when set and nothing extra when not", async () => {
    const withCover = await html("https://proj.supabase.co/storage/v1/object/public/m/a.jpg");
    expect(withCover).toContain('<img src="https://proj.supabase.co/storage/v1/object/public/m/a.jpg"');
    const drive = await html("https://drive.google.com/thumbnail?id=abc123");
    expect(drive).toContain("/api/cover/abc123");
    const without = await html(null);
    expect(without).not.toContain("<img");
    expect(without).toContain("Session check-in");
  });

  it("attendance page ignores a cover that fails the allowlist", async () => {
    expect(await html("https://evil.example.com/x.jpg")).not.toContain("<img");
    expect(await html("javascript:alert(1)")).not.toContain("<img");
  });
});
