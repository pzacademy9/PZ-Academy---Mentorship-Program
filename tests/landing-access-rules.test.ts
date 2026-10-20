import { describe, it, expect } from "vitest";
import {
  desiredEnrollment,
  emailGetsPortalLink,
  type AccessInput,
} from "@/lib/landing/registration/access-rules";

const base: AccessInput = {
  status: "paid",
  mode: "recorded",
  hasCourse: true,
  isTest: false,
  moduleIds: [],
  finishedModuleIds: [],
};

describe("desiredEnrollment", () => {
  it("paid recorded opens the portal", () => {
    const d = desiredEnrollment(base);
    expect(d).toMatchObject({ action: "grant", status: "active", portalOpen: true, accessLevel: "recorded" });
  });

  it("paid recorded never gets open modules", () => {
    const d = desiredEnrollment({ ...base, finishedModuleIds: ["a"] });
    expect(d).toMatchObject({ portalOpen: true, openModuleIds: [] });
  });

  it("paid live with no finished modules stays closed", () => {
    const d = desiredEnrollment({ ...base, mode: "live" });
    expect(d).toMatchObject({ action: "grant", status: "active", portalOpen: false, accessLevel: "live", openModuleIds: [] });
  });

  it("paid live with module A finished opens the portal with [A]", () => {
    const d = desiredEnrollment({ ...base, mode: "live", finishedModuleIds: ["a"] });
    expect(d).toMatchObject({ portalOpen: true, openModuleIds: ["a"] });
  });

  it("revert and skip carry no open modules and stay closed", () => {
    expect(desiredEnrollment({ ...base, mode: "live", status: "pending", finishedModuleIds: ["a"] })).toMatchObject({ action: "revert", portalOpen: false, openModuleIds: [] });
    expect(desiredEnrollment({ ...base, mode: "live", isTest: true, finishedModuleIds: ["a"] })).toMatchObject({ action: "skip", portalOpen: false, openModuleIds: [] });
  });

  it("underpaid and pending revert to pending, closed", () => {
    for (const status of ["underpaid", "pending"] as const) {
      expect(desiredEnrollment({ ...base, status })).toMatchObject({
        action: "revert",
        status: "pending",
        portalOpen: false,
      });
    }
  });

  it("reserved reverts to reserved, closed", () => {
    expect(desiredEnrollment({ ...base, status: "reserved" })).toMatchObject({
      action: "revert",
      status: "reserved",
      portalOpen: false,
    });
  });

  it("skips test rows, no-course pages and free rows", () => {
    expect(desiredEnrollment({ ...base, isTest: true }).action).toBe("skip");
    expect(desiredEnrollment({ ...base, hasCourse: false }).action).toBe("skip");
    expect(desiredEnrollment({ ...base, status: "free" }).action).toBe("skip");
  });

  it("passes moduleIds through", () => {
    expect(desiredEnrollment({ ...base, moduleIds: ["a", "b"] }).moduleIds).toEqual(["a", "b"]);
  });
});

describe("emailGetsPortalLink", () => {
  it("is true only for open grants", () => {
    expect(emailGetsPortalLink(desiredEnrollment(base))).toBe(true);
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, mode: "live" }))).toBe(false);
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, mode: "live", finishedModuleIds: ["a"] }))).toBe(true);
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, status: "pending" }))).toBe(false);
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, isTest: true }))).toBe(false);
  });
});
