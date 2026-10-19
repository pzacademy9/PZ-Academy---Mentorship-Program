import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, filterValue } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => db.client }));

import { getEnrolledCourses, getEnrollment, canOpenPortal } from "@/lib/data/lms";
import { hasActiveEnrollment } from "@/lib/data/enrollments";

const course = { id: "c1", slug: "c1", title: "C1", thumbnail_url: null, description: null };
const enr = (portal_open: boolean) => ({ student_id: "u1", course_id: "c1", status: "active", portal_open, courses: course });

beforeEach(() => db.reset());

describe("portal_open flag", () => {
  it("getEnrolledCourses filters on portal_open = true and hides a closed enrollment", async () => {
    db.state.handler = memoryHandler({ enrollments: [enr(false)] });
    expect(await getEnrolledCourses("u1")).toEqual([]);
    const op = db.find("enrollments", "select")[0];
    expect(filterValue(op, "eq", "portal_open")).toBe(true);
  });

  it("getEnrolledCourses lists an open enrollment", async () => {
    db.state.handler = memoryHandler({ enrollments: [enr(true)], lessons: [], modules: [] });
    expect((await getEnrolledCourses("u1")).map((c) => c.courseId)).toEqual(["c1"]);
  });

  it("hasActiveEnrollment requires portal_open", async () => {
    db.state.handler = memoryHandler({ enrollments: [enr(false)] });
    expect(await hasActiveEnrollment("c1", "u1")).toBe(false);
    expect(filterValue(db.find("enrollments", "select")[0], "eq", "portal_open")).toBe(true);
    db.reset();
    db.state.handler = memoryHandler({ enrollments: [enr(true)] });
    expect(await hasActiveEnrollment("c1", "u1")).toBe(true);
  });

  it("getEnrollment returns portal_open and canOpenPortal needs active + open", async () => {
    db.state.handler = memoryHandler({ enrollments: [enr(false)] });
    const e = await getEnrollment("c1", "u1");
    expect(e?.portal_open).toBe(false);
    expect(canOpenPortal(e)).toBe(false);
    expect(canOpenPortal({ status: "active", portal_open: true })).toBe(true);
    expect(canOpenPortal({ status: "pending", portal_open: true })).toBe(false);
    expect(canOpenPortal(null)).toBe(false);
  });
});
