import { describe, it, expect } from "vitest";
import { enrollmentsEntryTarget } from "@/lib/registrations/enrollments-entry";

const REG = "/dashboard/admin/enrollments/registrations";
const APP = "/dashboard/admin/enrollments/app";

describe("enrollmentsEntryTarget", () => {
  it("goes to registrations with no params", () => {
    expect(enrollmentsEntryTarget({})).toBe(REG);
  });
  it("keeps params for the app page", () => {
    expect(enrollmentsEntryTarget({ status: "all", courseId: "X", courseTitle: "A B" })).toBe(
      `${APP}?status=all&courseId=X&courseTitle=A+B`,
    );
  });
  it("repeats array values", () => {
    expect(enrollmentsEntryTarget({ status: ["a", "b"] })).toBe(`${APP}?status=a&status=b`);
  });
  it("counts empty string as present", () => {
    expect(enrollmentsEntryTarget({ status: "" })).toBe(`${APP}?status=`);
  });
  it("ignores undefined values", () => {
    expect(enrollmentsEntryTarget({ status: undefined })).toBe(REG);
  });
});
