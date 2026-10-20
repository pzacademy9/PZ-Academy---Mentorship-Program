import type { RegistrationStatus } from "@/lib/landing/registration/config";

export type EnrollmentStatusWord = "active" | "pending" | "reserved";
export interface AccessInput {
  status: RegistrationStatus;           // the registration's current status
  mode: "live" | "recorded";
  hasCourse: boolean;                   // page has a course_id
  isTest: boolean;
  /** Module ids the bought option covers; [] = whole course. */
  moduleIds: string[];
  /** Modules this buyer covers that the owner has marked finished (whole-course buyer: finished set of all course modules). */
  finishedModuleIds: string[];
}
export interface DesiredEnrollment {
  /** "skip" = do nothing at all (test row, no course, free row). */
  action: "skip" | "grant" | "revert";
  status: EnrollmentStatusWord;
  portalOpen: boolean;
  accessLevel: "live" | "recorded";
  moduleIds: string[];
  /** Modules to open for a Live buyer (rows in enrollment_open_modules). Always [] for recorded. */
  openModuleIds: string[];
}

export function desiredEnrollment(i: AccessInput): DesiredEnrollment {
  const base = { accessLevel: i.mode, moduleIds: i.moduleIds, openModuleIds: [] as string[] };
  if (i.isTest || !i.hasCourse || i.status === "free") return { action: "skip", status: "pending", portalOpen: false, ...base };
  if (i.status === "paid") {
    const openModuleIds = i.mode === "live" ? i.finishedModuleIds : [];
    const portalOpen = i.mode === "recorded" || openModuleIds.length > 0;
    return { action: "grant", status: "active", portalOpen, ...base, openModuleIds };
  }
  return { action: "revert", status: i.status === "reserved" ? "reserved" : "pending", portalOpen: false, ...base };
}

/** Portal link wanted in the Paid email: only when the portal is actually open. */
export const emailGetsPortalLink = (d: DesiredEnrollment): boolean => d.action === "grant" && d.portalOpen;
