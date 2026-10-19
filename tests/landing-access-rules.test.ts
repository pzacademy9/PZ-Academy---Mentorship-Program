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
  batchFinished: false,
};

describe("desiredEnrollment", () => {
  it("paid recorded opens the portal", () => {
    const d = desiredEnrollment(base);
    expect(d).toMatchObject({ action: "grant", status: "active", portalOpen: true, accessLevel: "recorded" });
  });

  it("paid live stays closed until batch finished", () => {
    const d = desiredEnrollment({ ...base, mode: "live" });
    expect(d).toMatchObject({ action: "grant", status: "active", portalOpen: false, accessLevel: "live" });
  });

  it("paid live opens when batch finished", () => {
    const d = desiredEnrollment({ ...base, mode: "live", batchFinished: true });
    expect(d.portalOpen).toBe(true);
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
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, status: "pending" }))).toBe(false);
    expect(emailGetsPortalLink(desiredEnrollment({ ...base, isTest: true }))).toBe(false);
  });
});
