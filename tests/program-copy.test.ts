import { describe, it, expect } from "vitest";
import { PROGRAM_COPY } from "@/lib/program-copy";
import { COURSE_TYPES } from "@/lib/validations/admin-lms";

describe("PROGRAM_COPY", () => {
  it("has an entry for every CourseType", () => {
    for (const type of COURSE_TYPES) {
      expect(PROGRAM_COPY[type]).toBeDefined();
    }
  });

  it("only shows the SECP certificate perk for credentialed program types", () => {
    expect(PROGRAM_COPY.webinar.showCertificate).toBe(false);
    expect(PROGRAM_COPY.course.showCertificate).toBe(true);
    expect(PROGRAM_COPY.workshop.showCertificate).toBe(true);
  });
});
