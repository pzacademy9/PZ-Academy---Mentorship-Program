import "server-only";
import { linkRegistrationsToStudent } from "@/lib/data/landing-registrations";

/** The parts of a Supabase `User` this needs (a `User` is assignable to it). */
export interface SessionUserLike {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * Gives a signed-in person the landing-page registrations they made as a guest with the same email
 * (ruling 9). Only for a confirmed email, so nobody can claim someone else's registrations by signing
 * up with their address. Idempotent (only unlinked rows change). Never throws; returns how many rows it linked.
 */
export async function linkGuestRegistrations(user: SessionUserLike | null | undefined): Promise<number> {
  try {
    if (!user?.id || !user.email || !user.email_confirmed_at) return 0;
    return await linkRegistrationsToStudent(user.id, user.email);
  } catch {
    return 0;
  }
}
