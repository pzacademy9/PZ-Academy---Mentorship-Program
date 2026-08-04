import { describe, it, expect } from "vitest";
import { toEmbedUrl } from "@/lib/video-embed";

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

  it("converts a vimeo.com URL", () => {
    expect(toEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
  });
});
