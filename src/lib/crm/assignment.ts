export const ASSIGN_CONTACTS_STORAGE_KEY = "pz.assign.contacts";

export type AssignCandidate = { id: string; ownerId: string | null; doNotContact: boolean };
export type AssignPlan = {
  toAssign: string[];
  alreadyYours: string[];
  skippedOwned: string[];
  skippedDnc: string[];
  reassigning: string[];
};

/**
 * Decide what a bulk assignment to `agentId` will do. Do-not-contact is never
 * assigned. A contact owned by someone else moves only when `includeOwned`.
 */
export function planAssignment(candidates: AssignCandidate[], agentId: string, includeOwned: boolean): AssignPlan {
  const plan: AssignPlan = { toAssign: [], alreadyYours: [], skippedOwned: [], skippedDnc: [], reassigning: [] };
  const seen = new Set<string>();
  for (const cand of candidates) {
    if (seen.has(cand.id)) continue;
    seen.add(cand.id);
    if (cand.doNotContact) { plan.skippedDnc.push(cand.id); continue; }
    if (cand.ownerId === agentId) { plan.alreadyYours.push(cand.id); continue; }
    if (cand.ownerId !== null && !includeOwned) { plan.skippedOwned.push(cand.id); continue; }
    plan.toAssign.push(cand.id);
    if (cand.ownerId !== null) plan.reassigning.push(cand.id);
  }
  return plan;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
