import { describe, it, expect } from "vitest";
import { coverProxyUrl } from "@/lib/feedback/cover-url";

describe("coverProxyUrl", () => {
  it("returns '' for null", () => {
    expect(coverProxyUrl(null)).toBe("");
  });

  it("returns '' for undefined", () => {
    expect(coverProxyUrl(undefined)).toBe("");
  });

  it("returns '' for an empty string", () => {
    expect(coverProxyUrl("")).toBe("");
  });

  it("rewrites a Drive '?id=' URL to the proxy path", () => {
    expect(coverProxyUrl("https://drive.google.com/uc?export=view&id=abc123_-XYZ")).toBe(
      "/api/cover/abc123_-XYZ",
    );
  });

  it("rewrites a Drive '/d/' URL to the proxy path", () => {
    expect(coverProxyUrl("https://drive.google.com/file/d/abc123_-XYZ/view")).toBe(
      "/api/cover/abc123_-XYZ",
    );
  });

  it("returns the original URL unchanged when no Drive id can be extracted", () => {
    expect(coverProxyUrl("https://example.com/cover.png")).toBe(
      "https://example.com/cover.png",
    );
  });
});
