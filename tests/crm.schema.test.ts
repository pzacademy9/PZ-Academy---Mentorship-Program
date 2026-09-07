import { describe, it, expect } from "vitest";
import { importPreviewSchema, importCommitSchema, mergeResolveSchema } from "@/lib/validations/crm";

const MAPPING = { name: 0, email: 1, phone: 2, profession: 3, discovery: 4, product: 5, rowType: 7, promoCode: 8 };

describe("importPreviewSchema", () => {
  it("accepts a sheet id, tab name, and mapping", () => {
    const parsed = importPreviewSchema.safeParse({ sheetId: "1c6P6fNlXkLlmJif1a", tabName: "Form Responses 1", mapping: MAPPING });
    expect(parsed.success).toBe(true);
  });

  it("rejects a mapping with no email and no phone column", () => {
    // Without at least one identity column every row would be rejected as
    // no-identity, so this is caught at the boundary rather than after a
    // full sheet read.
    const parsed = importPreviewSchema.safeParse({
      sheetId: "abc", tabName: "S",
      mapping: { ...MAPPING, email: null, phone: null },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a blank tab name", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "", mapping: MAPPING }).success).toBe(false);
  });

  it("rejects a negative column index", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: { ...MAPPING, name: -1 } }).success).toBe(false);
  });
});

describe("importCommitSchema", () => {
  it("accepts an optional courseId", () => {
    const parsed = importCommitSchema.safeParse({
      sheetId: "abc", tabName: "S", mapping: MAPPING,
      sheetName: "MDC3 Master Sheet",
      courseId: "3f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a commit with no courseId, since most cohorts have no course row", () => {
    const parsed = importCommitSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: MAPPING, sheetName: "X" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid courseId", () => {
    expect(importCommitSchema.safeParse({ sheetId: "a", tabName: "S", mapping: MAPPING, sheetName: "X", courseId: "nope" }).success).toBe(false);
  });
});

describe("mergeResolveSchema", () => {
  it("accepts merge and reject decisions", () => {
    expect(mergeResolveSchema.safeParse({ decision: "merge" }).success).toBe(true);
    expect(mergeResolveSchema.safeParse({ decision: "reject" }).success).toBe(true);
  });

  it("rejects any other decision", () => {
    expect(mergeResolveSchema.safeParse({ decision: "delete" }).success).toBe(false);
  });
});
