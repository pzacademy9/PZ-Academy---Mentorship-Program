import { describe, it, expect } from "vitest";
import {
  progressPercent,
  countFinishedCourses,
  sessionsAttended,
  averageRating,
  needsAttention,
} from "@/lib/students/student-metrics";

describe("progressPercent", () => {
  it("is 0 with no lessons", () => expect(progressPercent(0, 0)).toBe(0));
  it("rounds to nearest", () => expect(progressPercent(3, 1)).toBe(33));
  it("caps at 100", () => expect(progressPercent(4, 9)).toBe(100));
  it("clamps negative and NaN to 0", () => {
    expect(progressPercent(10, -3)).toBe(0);
    expect(progressPercent(NaN, 2)).toBe(0);
    expect(progressPercent(10, NaN)).toBe(0);
  });
});

describe("countFinishedCourses", () => {
  it("counts only fully completed courses; empty course is not finished", () => {
    const courses = [
      { courseId: "a", lessonIds: ["1", "2"] },
      { courseId: "b", lessonIds: ["3", "4"] },
      { courseId: "c", lessonIds: [] },
    ];
    expect(countFinishedCourses(courses, new Set(["1", "2", "3"]))).toBe(1);
    expect(countFinishedCourses([courses[2]], new Set())).toBe(0);
    expect(countFinishedCourses([], new Set())).toBe(0);
  });
});

describe("sessionsAttended", () => {
  it("formats 5 of 6", () => {
    expect(sessionsAttended(5, 6)).toEqual({ attended: 5, held: 6, label: "5 of 6" });
  });
  it("never shows attended above held", () => {
    expect(sessionsAttended(7, 6).label).toBe("7 of 7");
  });
  it("shows just the number when none held", () => {
    expect(sessionsAttended(0, 0).label).toBe("0");
    expect(sessionsAttended(5, 0)).toEqual({ attended: 5, held: 5, label: "5" });
  });
});

describe("averageRating", () => {
  it("ignores nulls, one decimal", () => {
    expect(averageRating([5, 4, null])).toBe(4.5);
    expect(averageRating([5, 4, 4])).toBe(4.3);
  });
  it("null when none", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([null, null])).toBeNull();
  });
});

describe("needsAttention", () => {
  it("is empty for nothing to flag", () => {
    expect(needsAttention({ enrollments: [], finishedCourses: 0, issuedGeneralCerts: 0 })).toEqual([]);
    expect(
      needsAttention({ enrollments: [{ courseTitle: "X", status: "paid" }], finishedCourses: 1, issuedGeneralCerts: 2 }),
    ).toEqual([]);
  });
  it("flags pending, rejected and missing certificates", () => {
    const items = needsAttention({
      enrollments: [
        { courseTitle: "DIT", status: "pending" },
        { courseTitle: "PMH", status: "rejected" },
        { courseTitle: "MDC", status: "approved" },
      ],
      finishedCourses: 3,
      issuedGeneralCerts: 1,
    });
    expect(items.map((i) => i.key)).toEqual(["pending:DIT", "rejected:PMH", "certs-pending"]);
    expect(items[0].title).toBe("Payment pending for DIT");
    expect(items[1].title).toBe("Payment rejected for PMH");
    expect(items[2].title).toBe("2 certificates are not yet issued");
  });
  it("uses singular for one certificate", () => {
    const items = needsAttention({ enrollments: [], finishedCourses: 1, issuedGeneralCerts: 0 });
    expect(items[0].title).toBe("1 certificate is not yet issued");
    expect(items[0].detail).toBe("Finished courses without a certificate yet.");
  });
});
