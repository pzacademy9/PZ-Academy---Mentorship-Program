import { describe, expect, it } from "vitest";
import { SECTION_DEFS, SECTION_TYPES, defaultSectionData, normalizeSectionData } from "@/lib/landing/sections";
import { emptyContent, type PageKind } from "@/lib/landing/content";

describe("demo_video section", () => {
  it("is a section type with the plain-word label", () => {
    expect((SECTION_TYPES as readonly string[]).includes("demo_video")).toBe(true);
    expect(SECTION_DEFS.demo_video.label).toBe("Watch a demo session");
  });

  it("a new demo section defaults pauseEvery to 20 and has the default popup texts", () => {
    const d = defaultSectionData("demo_video");
    expect(d.pauseEvery).toBe("20");
    expect(d.heading).toBe("Watch a demo session");
    expect(d.popupTitle).toBe("Enjoying the session?");
    expect(d.popupText).toBe("Register now to join the full course.");
  });

  it("an unknown pauseEvery normalizes to 20 and 15 and 30 are kept", () => {
    expect(normalizeSectionData("demo_video", { pauseEvery: "7" }).pauseEvery).toBe("20");
    expect(normalizeSectionData("demo_video", { pauseEvery: "15" }).pauseEvery).toBe("15");
    expect(normalizeSectionData("demo_video", { pauseEvery: "30" }).pauseEvery).toBe("30");
  });

  it("a bad YouTube link normalizes to empty and a good one is kept", () => {
    expect(normalizeSectionData("demo_video", { url: "https://example.com/x" }).url).toBe("");
    expect(normalizeSectionData("demo_video", { url: "https://youtu.be/dQw4w9WgXcQ" }).url).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("the link is optional, so an empty section never blocks publishing", () => {
    const f = SECTION_DEFS.demo_video.fields.find((x) => x.key === "url")!;
    expect(f.kind).toBe("youtube");
    expect(f.required).not.toBe(true);
  });

  it("blank pages of every kind do not contain demo_video", () => {
    for (const k of ["course", "workshop", "webinar"] as PageKind[]) {
      expect(emptyContent(k).sections.some((s) => s.type === "demo_video")).toBe(false);
    }
  });
});
