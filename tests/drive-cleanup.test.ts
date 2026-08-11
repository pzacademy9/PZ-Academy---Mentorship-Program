import { describe, it, expect } from "vitest";
import {
  extractDriveFileId,
  extractDriveFileIdFromViewUrl,
  diffCourseImageFileIds,
  diffLessonFileIds,
  collectLessonFileIds,
  diffSingleImageFileId,
} from "@/lib/validations/drive-cleanup";

describe("extractDriveFileId", () => {
  it("extracts the id from a Drive thumbnail URL", () => {
    expect(extractDriveFileId("https://drive.google.com/thumbnail?id=abc123&sz=w1600")).toBe("abc123");
  });

  it("returns null for a non-Drive URL", () => {
    expect(extractDriveFileId("https://example.com/image.png")).toBeNull();
  });

  it("returns null for a Drive URL that isn't the thumbnail endpoint", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/abc123/view")).toBeNull();
  });

  it("returns null for null, undefined, and empty string", () => {
    expect(extractDriveFileId(null)).toBeNull();
    expect(extractDriveFileId(undefined)).toBeNull();
    expect(extractDriveFileId("")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractDriveFileId("not a url")).toBeNull();
  });

  it("returns null for a non-https Drive thumbnail URL", () => {
    expect(extractDriveFileId("http://drive.google.com/thumbnail?id=abc123")).toBeNull();
  });
});

describe("extractDriveFileIdFromViewUrl", () => {
  it("extracts the id from a Drive view URL", () => {
    expect(extractDriveFileIdFromViewUrl("https://drive.google.com/file/d/abc123/view?usp=drivesdk")).toBe("abc123");
  });

  it("returns null for a non-Drive URL", () => {
    expect(extractDriveFileIdFromViewUrl("https://example.com/file.pdf")).toBeNull();
  });

  it("returns null for a Drive URL that isn't the /file/d/ shape", () => {
    expect(extractDriveFileIdFromViewUrl("https://drive.google.com/thumbnail?id=abc123&sz=w1600")).toBeNull();
  });

  it("returns null for null, undefined, and empty string", () => {
    expect(extractDriveFileIdFromViewUrl(null)).toBeNull();
    expect(extractDriveFileIdFromViewUrl(undefined)).toBeNull();
    expect(extractDriveFileIdFromViewUrl("")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractDriveFileIdFromViewUrl("not a url")).toBeNull();
  });

  it("returns null for a non-https Drive view URL", () => {
    expect(extractDriveFileIdFromViewUrl("http://drive.google.com/file/d/abc123/view")).toBeNull();
  });
});

describe("diffCourseImageFileIds", () => {
  const drive = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;

  it("returns the old fileId when a field is cleared", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("old-thumb"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: null, bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual(["old-thumb"]);
  });

  it("returns the old fileId when a field is replaced with a different Drive file", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("old-thumb"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: drive("new-thumb"), bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual(["old-thumb"]);
  });

  it("returns nothing when the value is unchanged", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("same"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: drive("same"), bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual([]);
  });

  it("returns nothing when the old value wasn't a Drive file (external URL)", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: "https://example.com/pic.png", bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: null, bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual([]);
  });

  it("checks all three fields independently", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("t1"), bannerUrl: drive("b1"), mentorAvatarUrl: drive("m1") },
      { thumbnailUrl: drive("t1"), bannerUrl: null, mentorAvatarUrl: drive("m2") },
    );
    expect(result.sort()).toEqual(["b1", "m1"]);
  });
});

describe("diffLessonFileIds", () => {
  it("trashes the old pdf when replaced", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "old-pdf", documents: [] },
      { pdfFileId: "new-pdf" },
    );
    expect(result).toEqual(["old-pdf"]);
  });

  it("does not trash the pdf when it wasn't part of this update", () => {
    const result = diffLessonFileIds({ pdfFileId: "old-pdf", documents: [] }, { documents: [] });
    expect(result).toEqual([]);
  });

  it("does not trash anything when the pdf is unchanged", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "same-pdf", documents: [] },
      { pdfFileId: "same-pdf" },
    );
    expect(result).toEqual([]);
  });

  it("trashes documents removed from the array", () => {
    const result = diffLessonFileIds(
      { pdfFileId: null, documents: [{ fileId: "doc1" }, { fileId: "doc2" }] },
      { documents: [{ fileId: "doc1" }] },
    );
    expect(result).toEqual(["doc2"]);
  });

  it("does not trash documents when the array wasn't part of this update", () => {
    const result = diffLessonFileIds(
      { pdfFileId: null, documents: [{ fileId: "doc1" }] },
      { pdfFileId: "some-pdf" },
    );
    expect(result).toEqual([]);
  });

  it("combines pdf and document removals in one call", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "old-pdf", documents: [{ fileId: "doc1" }] },
      { pdfFileId: "new-pdf", documents: [] },
    );
    expect(result.sort()).toEqual(["doc1", "old-pdf"]);
  });
});

describe("diffSingleImageFileId", () => {
  const drive = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;

  it("returns [] when the value is unchanged", () => {
    expect(diffSingleImageFileId(drive("same"), drive("same"))).toEqual([]);
  });

  it("returns [] for a seeded local mentor photo path — never sent to the trash relay", () => {
    expect(diffSingleImageFileId("/mentor-dr-roha.png", null)).toEqual([]);
    expect(diffSingleImageFileId("/mentor-dr-roha.png", drive("new"))).toEqual([]);
  });

  it("returns the old fileId when replaced with a different Drive file", () => {
    expect(diffSingleImageFileId(drive("old"), drive("new"))).toEqual(["old"]);
  });

  it("returns the old fileId when cleared", () => {
    expect(diffSingleImageFileId(drive("old"), null)).toEqual(["old"]);
  });

  it("returns [] for a foreign (non-Drive) URL", () => {
    expect(diffSingleImageFileId("https://example.com/pic.png", null)).toEqual([]);
  });
});

describe("collectLessonFileIds", () => {
  it("collects pdf and document fileIds across every lesson", () => {
    const result = collectLessonFileIds([
      { pdfFileId: "pdf1", documents: [{ fileId: "doc1" }, { fileId: "doc2" }] },
      { pdfFileId: null, documents: [{ fileId: "doc3" }] },
    ]);
    expect(result.sort()).toEqual(["doc1", "doc2", "doc3", "pdf1"]);
  });

  it("returns an empty array for lessons with no files", () => {
    expect(collectLessonFileIds([{ pdfFileId: null, documents: [] }])).toEqual([]);
  });
});
