import type { RegistrationStatus } from "@/lib/landing/registration/config";

export type EnrollmentStatusWord = "active" | "pending" | "reserved";
export interface AccessInput {
  status: RegistrationStatus;           // the registration's current status
  mode: "live" | "recorded";
  hasCourse: boolean;                   // page has a course_id
  isTest: boolean;
  /** Module ids the bought option covers; [] = whole course. */
  moduleIds: string[];
  /** True when the owner has pressed Batch finished for everything this buyer bought. */
  batchFinished: boolean;
}
export interface DesiredEnrollment {
  /** "skip" = do nothing at all (test row, no course, free row). */
  action: "skip" | "grant" | "revert";
  status: EnrollmentStatusWord;
  portalOpen: boolean;
  accessLevel: "live" | "recorded";
  moduleIds: string[];
}

export function desiredEnrollment(i: AccessInput): DesiredEnrollment {
  const base = { accessLevel: i.mode, moduleIds: i.moduleIds };
  if (i.isTest || !i.hasCourse || i.status === "free") return { action: "skip", status: "pending", portalOpen: false, ...base };
  if (i.status === "paid") {
    const portalOpen = i.mode === "recorded" || i.batchFinished;
    return { action: "grant", status: "active", portalOpen, ...base };
  }
  return { action: "revert", status: i.status === "reserved" ? "reserved" : "pending", portalOpen: false, ...base };
}

/** Portal link wanted in the Paid email: only when the portal is actually open. */
export const emailGetsPortalLink = (d: DesiredEnrollment): boolean => d.action === "grant" && d.portalOpen;
