import type { Role } from "@/lib/roles";

export type Actor = { id: string; role: Role };
export type ContactOwnership = { owner_id: string | null | undefined };
export type OwnershipCheck =
  | { ok: true }
  | { ok: false; reason: "not-allowed" | "not-owner" | "already-claimed" };

const isAdmin = (role: Role) => role === "admin" || role === "super_admin";

/**
 * May `actor` act on (log outcomes, message, edit notes for) this contact?
 * Sales agents: only their own. Admins: any. Everyone else: never.
 * Every sales route must call this before touching a contact, because the
 * service-role client bypasses row-level security.
 */
export function canActOnContact(contact: ContactOwnership, actor: Actor): OwnershipCheck {
  if (isAdmin(actor.role)) return { ok: true };
  if (actor.role !== "sales_agent") return { ok: false, reason: "not-allowed" };
  if (actor.id !== "" && contact.owner_id === actor.id) return { ok: true };
  return { ok: false, reason: "not-owner" };
}

export type DetailViewer = { viewerId: string; viewerRole: Role; ownerId: string | null | undefined };

/**
 * May this viewer see a contact's full details (phone, email, profession,
 * timeline)? Admins: always. Unclaimed contacts: yes (hand-over). Owner: yes.
 * A sales agent looking at ANOTHER agent's contact: no - they get only name,
 * owner and status. Provisional owner ruling, see the Phase B1 ledger.
 */
export function canSeeDetails({ viewerId, viewerRole, ownerId }: DetailViewer): boolean {
  if (isAdmin(viewerRole)) return true;
  if (ownerId == null) return true;
  return viewerId !== "" && ownerId === viewerId;
}

/** May `actor` claim this contact? Only unclaimed contacts, only by sales agents or admins. */
export function canClaimContact(contact: ContactOwnership, actor: Actor): OwnershipCheck {
  if (!isAdmin(actor.role) && actor.role !== "sales_agent") return { ok: false, reason: "not-allowed" };
  if (contact.owner_id != null) return { ok: false, reason: "already-claimed" };
  return { ok: true };
}
