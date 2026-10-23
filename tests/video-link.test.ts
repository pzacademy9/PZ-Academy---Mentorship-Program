import { describe, it, expect } from "vitest";
import { checkVideoLink } from "@/lib/video-link";

describe("checkVideoLink", () => {
  it("accepts youtu.be", () => {
    expect(checkVideoLink("https://youtu.be/abc?t=30")).toEqual({ status: "ok", provider: "youtube" });
  });
  it("accepts m.youtube.com", () => {
    expect(checkVideoLink("https://m.youtube.com/watch?v=abc")).toEqual({ status: "ok", provider: "youtube" });
  });
  it("accepts shorts", () => {
    expect(checkVideoLink("https://www.youtube.com/shorts/abc")).toEqual({ status: "ok", provider: "youtube" });
  });
  it("accepts vimeo", () => {
    expect(checkVideoLink("https://vimeo.com/123")).toEqual({ status: "ok", provider: "vimeo" });
  });
  it("rejects drive", () => {
    expect(checkVideoLink("https://drive.google.com/file/d/x/view")).toEqual({
      status: "unsupported",
      message: "Google Drive videos cannot be played here. Use a YouTube or Vimeo link.",
    });
  });
  it("flags non-URL text", () => {
    expect(checkVideoLink("hello")).toEqual({ status: "invalid", message: "That doesn't look like a web link." });
  });
  it("treats a link without protocol as invalid", () => {
    expect(checkVideoLink("youtu.be/abc").status).toBe("invalid");
  });
  it("treats blank as empty", () => {
    expect(checkVideoLink("  ")).toEqual({ status: "empty" });
    expect(checkVideoLink("")).toEqual({ status: "empty" });
  });
  it("flags other web hosts as unsupported", () => {
    expect(checkVideoLink("https://example.com/v").status).toBe("unsupported");
  });
});
