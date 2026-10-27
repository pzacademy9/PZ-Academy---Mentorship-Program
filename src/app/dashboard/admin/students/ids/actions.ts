"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { findPeople, mergePeople, type PersonResult } from "@/lib/data/pz-people-admin";

export type FindPeopleResult =
  | { ok: true; people: PersonResult[]; truncated: boolean }
  | { ok: false; message: string };

const NO_PERMISSION = "You do not have permission to do this.";

/** Admin only: look up people by PZ ID, old ID, email or name. */
export async function findPeopleAction(query: string): Promise<FindPeopleResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  try {
    const { people, truncated } = await findPeople(String(query ?? ""));
    return { ok: true, people, truncated };
  } catch {
    return { ok: false, message: "Could not search students. Please try again." };
  }
}

/** Admin only: merge one person into another. The merged PZ ID keeps working. */
export async function mergePeopleAction(
  keepId: string,
  dropId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return mergePeople(String(keepId ?? ""), String(dropId ?? ""));
}
