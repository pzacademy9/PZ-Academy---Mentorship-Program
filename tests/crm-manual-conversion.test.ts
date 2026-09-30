import { describe, it, expect } from "vitest";
import { toManualConversionProgram, fromManualConversionProgram } from "@/lib/crm/manual-conversion";

describe("toManualConversionProgram", () => {
  it("returns a course program when course_id is set", () => {
    expect(toManualConversionProgram("course-1", null)).toEqual({ kind: "course", courseId: "course-1" });
  });

  it("returns a label program when program_label is set", () => {
    expect(toManualConversionProgram(null, "Advanced Mixing")).toEqual({ kind: "label", pattern: "Advanced Mixing" });
  });

  it("returns null when neither is set", () => {
    expect(toManualConversionProgram(null, null)).toBeNull();
  });

  it("returns null when both are set — ambiguous, not a valid stored row", () => {
    expect(toManualConversionProgram("course-1", "Advanced Mixing")).toBeNull();
  });
});

describe("fromManualConversionProgram", () => {
  it("maps a course program to course_id only", () => {
    expect(fromManualConversionProgram({ kind: "course", courseId: "course-1" })).toEqual({
      course_id: "course-1",
      program_label: null,
    });
  });

  it("maps a label program to program_label only", () => {
    expect(fromManualConversionProgram({ kind: "label", pattern: "Advanced Mixing" })).toEqual({
      course_id: null,
      program_label: "Advanced Mixing",
    });
  });
});
