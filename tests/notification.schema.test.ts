import { describe, it, expect } from "vitest";
import {
  adminNotificationSchema,
  markNotificationsReadSchema,
} from "@/lib/validations/notification";

const base = { audience: "all" as const, title: "Live session moved" };

describe("adminNotificationSchema — audience", () => {
  it("accepts a broadcast to all students", () => {
    expect(adminNotificationSchema.safeParse(base).success).toBe(true);
  });

  it("requires a uuid for a single student", () => {
    expect(
      adminNotificationSchema.safeParse({ audience: "student", studentId: "nope", title: base.title })
        .success,
    ).toBe(false);
    expect(
      adminNotificationSchema.safeParse({
        audience: "student",
        studentId: "3f1a8c2e-0b7d-4c1a-9e55-2b6d4f8a1c33",
        title: base.title,
      }).success,
    ).toBe(true);
  });

  it("requires a uuid for a course", () => {
    expect(
      adminNotificationSchema.safeParse({ audience: "course", courseId: "1", title: base.title })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown audience", () => {
    expect(adminNotificationSchema.safeParse({ audience: "mentors", title: base.title }).success).toBe(
      false,
    );
  });

  it("rejects a too-short title", () => {
    expect(adminNotificationSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
});

describe("adminNotificationSchema — link hardening", () => {
  it("accepts internal paths", () => {
    for (const link of ["/courses", "/portal/ppc-batch-2", "/dashboard/notifications?tab=all", "/"]) {
      expect(adminNotificationSchema.safeParse({ ...base, link }).success).toBe(true);
    }
  });

  it("rejects absolute urls", () => {
    for (const link of ["https://evil.example.com", "http://evil.example.com", "mailto:a@b.c"]) {
      expect(adminNotificationSchema.safeParse({ ...base, link }).success).toBe(false);
    }
  });

  /*
   * Regression: "//evil.example.com" starts with "/" and contains only legal
   * path characters, so the original regex accepted it — but a browser reads a
   * protocol-relative "//host" as absolute, turning a trusted in-app notice
   * into an off-site redirect. Caught in live testing, fixed with a negative
   * lookahead.
   */
  it("rejects protocol-relative and backslash-smuggled urls", () => {
    for (const link of ["//evil.example.com", "///evil.example.com", "/\\evil.example.com"]) {
      expect(adminNotificationSchema.safeParse({ ...base, link }).success).toBe(false);
    }
  });

  it("rejects a link that does not start with a slash", () => {
    expect(adminNotificationSchema.safeParse({ ...base, link: "courses" }).success).toBe(false);
  });
});

describe("markNotificationsReadSchema", () => {
  it("accepts an empty body, meaning mark all", () => {
    expect(markNotificationsReadSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a single uuid", () => {
    expect(
      markNotificationsReadSchema.safeParse({ id: "3f1a8c2e-0b7d-4c1a-9e55-2b6d4f8a1c33" }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(markNotificationsReadSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});
