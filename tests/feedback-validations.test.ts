import { describe, it, expect } from "vitest";
import {
  cleanText, isValidEmail, clampStar, sanitizeAnswer, slugify, uniqueSlug, csvCell,
} from "@/lib/validations/feedback";

describe("cleanText", () => {
  it("trims and caps length", () => {
    expect(cleanText("  hi  ", 10)).toBe("hi");
    expect(cleanText("a".repeat(20), 5)).toBe("aaaaa");
  });
  it("strips control characters but keeps newlines", () => {
    expect(cleanText("a\x00b\nc", 10)).toBe("ab\nc");
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible email", () => expect(isValidEmail("a@b.com")).toBe(true));
  it("rejects a string with no @", () => expect(isValidEmail("nope")).toBe(false));
  it("rejects an over-length email", () => expect(isValidEmail("a@" + "b".repeat(300) + ".com")).toBe(false));
});

describe("clampStar", () => {
  it("accepts 1..5", () => expect(clampStar("3")).toBe(3));
  it("rejects 0 and 6", () => {
    expect(clampStar(0)).toBeNull();
    expect(clampStar(6)).toBeNull();
  });
  it("rejects non-numeric", () => expect(clampStar("abc")).toBeNull());
});

describe("sanitizeAnswer", () => {
  it("keeps an http url as-is (capped)", () => expect(sanitizeAnswer("https://x.com/v")).toBe("https://x.com/v"));
  it("converts a valid star string to a number", () => expect(sanitizeAnswer("4")).toBe(4));
  it("returns empty string for garbage", () => expect(sanitizeAnswer("banana")).toBe(""));
});

describe("slugify / uniqueSlug", () => {
  it("lowercases and hyphenates", () => expect(slugify("AMS Batch 1: Day 2!")).toBe("ams-batch-1-day-2"));
  it("falls back to base when free", () => expect(uniqueSlug("Day 1", [], null)).toBe("day-1"));
  it("appends -2 on collision", () => {
    expect(uniqueSlug("Day 1", [{ id: "x", slug: "day-1" }], null)).toBe("day-1-2");
  });
  it("ignores the row's own id when renaming", () => {
    expect(uniqueSlug("Day 1", [{ id: "self", slug: "day-1" }], "self")).toBe("day-1");
  });
});

describe("csvCell", () => {
  it("quotes a value containing a comma", () => expect(csvCell("a,b")).toBe('"a,b"'));
  it("escapes embedded quotes", () => expect(csvCell('say "hi"')).toBe('"say ""hi"""'));
  it("leaves a plain value unquoted", () => expect(csvCell("plain")).toBe("plain"));
});
