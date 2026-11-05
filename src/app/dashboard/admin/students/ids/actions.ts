"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { findPeople, mergePeople, type PersonResult } from "@/lib/data/pz-people-admin";
import {
  addPersonEmail,
  getPersonDetail,
  reissuePersonId,
  removePersonEmail,
  renamePerson,
  sendIdEmail,
  type PersonDetail,
} from "@/lib/data/pz-people-fix";

export type FindPeopleResult =
  | { ok: true; people: PersonResult[]; truncated: boolean }
  | { ok: false; message: string };

const NO_PERMISSION = "You do not have permission to do this.";

/** Admin only: look up people by PZ ID, old ID, email or name. */
export async function findPeopleAction(query: string): Promise<FindPeopleResult> {
  const auth = await requireAdmin("students");
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
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return mergePeople(String(keepId ?? ""), String(dropId ?? ""));
}

type FixRes = { ok: true } | { ok: false; message: string };

/** Admin only: one student's details for the fix panel. */
export async function loadPersonAction(id: string): Promise<{ ok: true; person: PersonDetail } | { ok: false; message: string }> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  try {
    const person = await getPersonDetail(String(id ?? ""));
    return person ? { ok: true, person } : { ok: false, message: "This student was not found. Search again." };
  } catch {
    return { ok: false, message: "Could not load this student. Please try again." };
  }
}

/** Admin only: correct the student's name. The ID does not change. */
export async function renamePersonAction(id: string, name: string): Promise<FixRes> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return renamePerson(String(id ?? ""), String(name ?? ""));
}

/** Admin only: give the student a new ID from their name. The old ID keeps working. */
export async function reissuePersonIdAction(id: string): Promise<{ ok: true; oldId: string; newId: string } | { ok: false; message: string }> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return reissuePersonId(String(id ?? ""));
}

/** Admin only: add an email to the student. */
export async function addPersonEmailAction(id: string, email: string): Promise<FixRes> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return addPersonEmail(String(id ?? ""), String(email ?? ""));
}

/** Admin only: remove one of the student's emails (one must stay). */
export async function removePersonEmailAction(id: string, email: string): Promise<FixRes> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return removePersonEmail(String(id ?? ""), String(email ?? ""));
}

/** Admin only: email the student their ID, to one of their own emails. */
export async function sendIdEmailAction(id: string, email: string): Promise<FixRes> {
  const auth = await requireAdmin("students");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  return sendIdEmail(String(id ?? ""), String(email ?? ""));
}
