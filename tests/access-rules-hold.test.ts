import { describe, it, expect } from "vitest";
import { desiredEnrollment, type AccessInput } from "@/lib/landing/registration/access-rules";

const base: AccessInput = {
  status: "paid",
  mode: "live",
  hasCourse: true,
  isTest: false,
  moduleIds: [],
  finishedModuleIds: ["m1"],
  hasLabelWithoutChoice: false,
};

describe("desiredEnrollment hold", () => {
  it("desiredEnrollment holds a Paid row that has a label but no recorded choice", () => {
    const d = desiredEnrollment({ ...base, hasLabelWithoutChoice: true });
    expect(d).toMatchObject({ action: "hold", status: "pending", portalOpen: false, openModuleIds: [] });
  });

  it("a Paid row with a recorded choice is granted as before", () => {
    expect(desiredEnrollment({ ...base, moduleIds: ["m1"] })).toMatchObject({ action: "grant", status: "active", portalOpen: true, openModuleIds: ["m1"] });
  });

  it("a Paid row with no label and no choice is granted as before", () => {
    expect(desiredEnrollment({ ...base, hasLabelWithoutChoice: false })).toMatchObject({ action: "grant", status: "active" });
  });

  it("free, test and no-course rows still skip even when hasLabelWithoutChoice is true", () => {
    const held = { ...base, hasLabelWithoutChoice: true };
    expect(desiredEnrollment({ ...held, status: "free" }).action).toBe("skip");
    expect(desiredEnrollment({ ...held, isTest: true }).action).toBe("skip");
    expect(desiredEnrollment({ ...held, hasCourse: false }).action).toBe("skip");
  });

  it("pending, reserved and underpaid rows still revert even when hasLabelWithoutChoice is true", () => {
    const held = { ...base, hasLabelWithoutChoice: true };
    expect(desiredEnrollment({ ...held, status: "pending" })).toMatchObject({ action: "revert", status: "pending", portalOpen: false });
    expect(desiredEnrollment({ ...held, status: "underpaid" })).toMatchObject({ action: "revert", status: "pending", portalOpen: false });
    expect(desiredEnrollment({ ...held, status: "reserved" })).toMatchObject({ action: "revert", status: "reserved", portalOpen: false });
  });
});
