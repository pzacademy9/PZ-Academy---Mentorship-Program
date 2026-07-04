import { describe, it, expect } from "vitest";
import { truncatePreview } from "@/lib/data/notes";

describe("truncatePreview", () => {
  it("returns short text unchanged", () => {
    expect(truncatePreview("First-pass effect reduces bioavailability.")).toBe(
      "First-pass effect reduces bioavailability.",
    );
  });

  it("collapses whitespace and newlines into single spaces", () => {
    expect(truncatePreview("Line one\n\n  Line   two")).toBe("Line one Line two");
  });

  it("truncates text longer than maxLen and appends an ellipsis", () => {
    const long = "a".repeat(200);
    const result = truncatePreview(long, 150);
    expect(result).toHaveLength(151); // 150 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate text exactly at maxLen", () => {
    const exact = "a".repeat(150);
    expect(truncatePreview(exact, 150)).toBe(exact);
  });

  it("returns an empty string unchanged", () => {
    expect(truncatePreview("")).toBe("");
  });
});
