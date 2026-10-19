import "server-only";
import { linkRegistrationsToStudentIds } from "@/lib/data/landing-registrations";
import { enqueueEnrollmentSync, runJobsFor, runJobsDirect } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";

/** The parts of a Supabase `User` this needs (a `User` is assignable to it). */
export interface SessionUserLike {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * Gives a signed-in person the landing-page registrations they made as a guest with the same email
 * (ruling 9). Only for a confirmed email, so nobody can claim someone else's registrations by signing
 * up with their address. Idempotent (only unlinked rows change). Linked Paid registrations get an enrollment_sync
 * job (no email: the Paid email already went to them as a guest). Never throws; returns how many rows it linked.
 */
export async function linkGuestRegistrations(user: SessionUserLike | null | undefined): Promise<number> {
  try {
    if (!user?.id || !user.email || !user.email_confirmed_at) return 0;
    const linked = await linkRegistrationsToStudentIds(user.id, user.email);
    for (const row of linked) {
      if (row.status !== "paid") continue;
      try {
        const queued = await enqueueEnrollmentSync(row.id);
        runInBackground(queued ? runJobsFor(row.id) : runJobsDirect(row.id, ["enrollment_sync"]));
      } catch {
        // enrolment is retried by the next status change or the admin; linking itself succeeded
      }
    }
    return linked.length;
  } catch {
    return 0;
  }
}
