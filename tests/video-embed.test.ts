import { describe, it, expect } from "vitest";
import { toEmbedUrl, videoThumbnail } from "@/lib/video-embed";

describe("toEmbedUrl", () => {
  it("converts youtube.com/live/<id> URLs (the seeded webinar link format)", () => {
    expect(toEmbedUrl("https://youtube.com/live/Elqiz7k_6PQ")).toBe(
      "https://www.youtube.com/embed/Elqiz7k_6PQ",
    );
  });

  it("converts a standard watch?v= URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("converts a youtu.be short URL", () => {
    expect(toEmbedUrl("https://youtu.be/abc123")).toBe("https://www.youtube.com/embed/abc123");
  });

  it("leaves an already-embeddable URL unchanged", () => {
    expect(toEmbedUrl("https://www.youtube.com/embed/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("converts a youtube.com/shorts/<id> URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/shorts/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("converts a vimeo.com URL", () => {
    expect(toEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
  });
});

describe("videoThumbnail", () => {
  const thumb = "https://img.youtube.com/vi/abc123/hqdefault.jpg";
  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123?t=30",
    "https://www.youtube.com/shorts/abc123",
    "https://www.youtube.com/embed/abc123",
    "https://youtube.com/live/abc123",
    "https://m.youtube.com/watch?v=abc123",
  ])("returns the thumbnail for %s", (url) => {
    expect(videoThumbnail(url)).toBe(thumb);
  });
  it.each(["https://vimeo.com/12345", "", "hello", "https://drive.google.com/file/d/x/view", "https://www.youtube.com/", "https://youtu.be/"])(
    "returns null for %s",
    (url) => {
      expect(videoThumbnail(url)).toBeNull();
    },
  );
});
