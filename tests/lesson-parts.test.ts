import { describe, it, expect } from "vitest";
import { deriveContentType, sessionReadiness, courseReadiness, missingSummary } from "@/lib/lms/lesson-parts";

describe("deriveContentType", () => {
  it("video wins over pdf", () => {
    expect(deriveContentType({ videoUrl: "https://youtu.be/a", pdfFileId: "f" })).toBe("video");
  });
  it("only videoUrl2 gives video", () => {
    expect(deriveContentType({ videoUrl: "  ", videoUrl2: "https://youtu.be/a" })).toBe("video");
  });
  it("pdf when no video", () => {
    expect(deriveContentType({ videoUrl: "", pdfFileId: "f" })).toBe("pdf");
  });
  it("text otherwise", () => {
    expect(deriveContentType({})).toBe("text");
  });
});

describe("sessionReadiness", () => {
  it("webinar with video is ready", () => {
    expect(sessionReadiness("webinar", { hasVideo: true, quizCount: 0 })).toEqual({ ready: true, missing: [] });
  });
  it("course needs a quiz", () => {
    expect(sessionReadiness("course", { hasVideo: true, quizCount: 0 })).toEqual({ ready: false, missing: ["quiz"] });
  });
  it("course missing both", () => {
    expect(sessionReadiness("workshop", { hasVideo: false, quizCount: 0 })?.missing).toEqual(["video", "quiz"]);
  });
  it("mentorship is null", () => {
    expect(sessionReadiness("mentorship", { hasVideo: true, quizCount: 1 })).toBeNull();
  });
});

describe("courseReadiness", () => {
  it("no sessions", () => {
    expect(courseReadiness("course", []).label).toBe("No sessions yet");
  });
  it("counts ready", () => {
    expect(
      courseReadiness("course", [
        { hasVideo: true, quizCount: 1 },
        { hasVideo: true, quizCount: 0 },
      ]),
    ).toEqual({ readyCount: 1, total: 2, label: "Ready: 1 of 2 sessions" });
  });
  it("mentorship hides label", () => {
    expect(courseReadiness("mentorship", [{ hasVideo: false, quizCount: 0 }])).toEqual({
      readyCount: 0,
      total: 1,
      label: "",
    });
  });
});

describe("missingSummary", () => {
  it("lists lines, skipping ready", () => {
    expect(
      missingSummary("course", [
        { title: "Day 1: A", hasVideo: true, quizCount: 1 },
        { title: "Day 6: Pain", hasVideo: false, quizCount: 1 },
        { title: "Day 9: ICU", hasVideo: true, quizCount: 0 },
        { title: "Day 3: X", hasVideo: false, quizCount: 0 },
      ]),
    ).toEqual(["Day 6: Pain: no video", "Day 9: ICU: no quiz", "Day 3: X: no video and no quiz"]);
  });
  it("empty for mentorship", () => {
    expect(missingSummary("mentorship", [{ title: "a", hasVideo: false, quizCount: 0 }])).toEqual([]);
  });
});
