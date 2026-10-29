import { describe, it, expect } from "vitest";
import { isAllowedCoverUrl } from "@/lib/classes/cover";

describe("isAllowedCoverUrl", () => {
  it("allows https library hosts", () => {
    expect(isAllowedCoverUrl("https://drive.google.com/thumbnail?id=abcdefghij&sz=w1600")).toBe(true);
    expect(isAllowedCoverUrl("https://lh3.googleusercontent.com/d/abc")).toBe(true);
  });
  it("allows the Supabase storage host", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    try {
      expect(isAllowedCoverUrl("https://abc.supabase.co/storage/v1/object/public/x.png")).toBe(true);
      expect(isAllowedCoverUrl("https://other.supabase.co/x.png")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });
  it("rejects http, other hosts, metadata addresses, junk and empty", () => {
    for (const u of ["http://drive.google.com/thumbnail?id=a", "http://169.254.169.254/", "https://evil.example", "https://drive.google.com.evil.example/x", "https://u:p@drive.google.com/x", "nope", "", null, undefined]) {
      expect(isAllowedCoverUrl(u as string | null | undefined)).toBe(false);
    }
  });
});
