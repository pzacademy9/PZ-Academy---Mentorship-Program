import { describe, it, expect } from "vitest";
import {
  orientationOf,
  fitFor,
  fileIdFromUrl,
  cleanMediaName,
  canManageMedia,
  MEDIA_FOLDERS,
} from "@/lib/landing/media";

describe("orientationOf", () => {
  it("classifies", () => {
    expect(orientationOf(1600, 900)).toBe("wide");
    expect(orientationOf(900, 1600)).toBe("tall");
    expect(orientationOf(1000, 1000)).toBe("square");
    expect(orientationOf(0, 10)).toBeNull();
    expect(orientationOf(null, 5)).toBeNull();
  });
  it("handles exact boundaries", () => {
    expect(orientationOf(120, 100)).toBe("wide");
    expect(orientationOf(83, 100)).toBe("tall");
  });
});

describe("fitFor", () => {
  it("compares", () => {
    expect(fitFor("wide", "wide")).toBe("fits");
    expect(fitFor("tall", "wide")).toBe("other");
    expect(fitFor(null, "tall")).toBe("unknown");
  });
});

describe("fileIdFromUrl", () => {
  it("extracts ids", () => {
    expect(fileIdFromUrl("https://drive.google.com/thumbnail?id=ABCDEFGHIJ1&sz=w1600")).toBe("ABCDEFGHIJ1");
    expect(fileIdFromUrl("https://drive.google.com/file/d/ABCDEFGHIJ1/view")).toBe("ABCDEFGHIJ1");
    expect(fileIdFromUrl("https://example.com/a.jpg")).toBeNull();
    expect(fileIdFromUrl("")).toBeNull();
    expect(fileIdFromUrl(undefined)).toBeNull();
  });
});

describe("cleanMediaName", () => {
  it("trims and bounds", () => {
    expect(cleanMediaName("  Dr Sara  ")).toEqual({ ok: true, name: "Dr Sara" });
    expect(cleanMediaName("   ")).toEqual({ ok: false });
    expect(cleanMediaName("a".repeat(81))).toEqual({ ok: false });
    expect(cleanMediaName("a".repeat(80))).toEqual({ ok: true, name: "a".repeat(80) });
  });
});

describe("canManageMedia", () => {
  it("admins only", () => {
    expect(canManageMedia("admin")).toBe(true);
    expect(canManageMedia("student")).toBe(false);
    expect(canManageMedia(null)).toBe(false);
  });
});

describe("MEDIA_FOLDERS", () => {
  it("has the exact labels", () => {
    expect(MEDIA_FOLDERS).toEqual([
      { key: "heroes", label: "Heroes" },
      { key: "instructors", label: "Instructors" },
      { key: "misc", label: "Misc" },
    ]);
  });
});
