import type { Role } from "@/lib/roles";

export const TOUR_LOCAL_KEY = "pz-sales-tour-seen";

/** One-time tour for sales agents (decision D5); Help can replay it with ?tour=1 for anyone. */
export function shouldShowTour(i: { role: Role; metadataSeen: boolean; localSeen: boolean; forced: boolean }): boolean {
  if (i.forced) return true;
  return i.role === "sales_agent" && !i.metadataSeen && !i.localSeen;
}
