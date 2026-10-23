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

  const NOT_SINGLE = { status: "invalid", message: "That link doesn't point to a single video." };
  it.each([
    "https://www.youtube.com/watch",
    "https://www.youtube.com/",
    "https://www.youtube.com/playlist?list=x",
    "https://youtu.be/",
    "https://vimeo.com/",
    "https://vimeo.com/channels/x/123",
    "https://vimeo.com/video/123",
    "https://www.youtube.com/embed/",
  ])("rejects host-only or non-video path %s", (u) => {
    expect(checkVideoLink(u)).toEqual(NOT_SINGLE);
  });
  it.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://www.youtube.com/embed/abc", "youtube"],
    ["https://www.youtube.com/shorts/abc", "youtube"],
    ["https://www.youtube.com/live/abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://vimeo.com/123", "vimeo"],
    ["https://player.vimeo.com/video/123", "vimeo"],
  ])("accepts %s", (u, provider) => {
    expect(checkVideoLink(u)).toEqual({ status: "ok", provider });
  });
  it("catches drive.usercontent.google.com as Drive", () => {
    expect(checkVideoLink("https://drive.usercontent.google.com/download?id=x").status).toBe("unsupported");
    expect(JSON.stringify(checkVideoLink("https://drive.usercontent.google.com/download?id=x"))).toContain("Google Drive");
  });
});
