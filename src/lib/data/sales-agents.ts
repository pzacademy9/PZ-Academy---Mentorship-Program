import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { findAccountIdByEmail } from "@/lib/data/mentor-accounts";
import { decidePromotion } from "@/lib/crm/sales-agent-rules";
import type { Role } from "@/lib/roles";

/**
 * Admin-facing sales agent account management. Service-role client; every
 * caller is already gated by requireAdmin() at its own route boundary.
 * Mirrors data/mentor-accounts.ts.
 */

export type SalesAgentRow = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  contactCount: number;
};

export async function listSalesAgents(): Promise<SalesAgentRow[]> {
  const admin = createAdminSupabase();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("role", "sales_agent")
    .order("created_at", { ascending: true });

  const rows: SalesAgentRow[] = [];
  for (const p of profiles ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(p.id);
    const { count } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", p.id);
    rows.push({
      id: p.id,
      fullName: p.full_name,
      email: authUser?.user?.email ?? "",
      createdAt: p.created_at,
      contactCount: count ?? 0,
    });
  }
  return rows;
}

export type InviteSalesAgentResult =
  | { status: "invited"; email: string }
  | { status: "existing"; email: string }
  | { status: "error"; reason: "invite-failed" | "db-error" };

/**
 * Step 1. A brand-new email is invited and set to sales_agent. An email that
 * already has an account is NOT touched: the caller gets "existing" so the
 * admin UI can ask for confirmation first (step 2).
 */
export async function inviteOrCheckSalesAgent(
  email: string,
  fullName: string,
  redirectTo: string,
): Promise<InviteSalesAgentResult> {
  const admin = createAdminSupabase();

  const existingId = await findAccountIdByEmail(email);
  if (existingId) return { status: "existing", email };

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (inviteError || !invited?.user) return { status: "error", reason: "invite-failed" };

  // handle_new_user already created the profiles row as 'student'; fix the role
  // before this person can ever log in.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "sales_agent" })
    .eq("id", invited.user.id);
  if (profileError) return { status: "error", reason: "db-error" };

  return { status: "invited", email };
}

export type PromoteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "account-not-found" | "already-sales-agent" | "is-admin" | "is-mentor" | "db-error";
    };

/** Step 2, after the admin confirmed the "this email already has an account" dialog. */
export async function confirmPromoteToSalesAgent(email: string): Promise<PromoteResult> {
  const admin = createAdminSupabase();

  const accountId = await findAccountIdByEmail(email);
  if (!accountId) return { ok: false, reason: "account-not-found" };

  const { data: account } = await admin.from("profiles").select("role").eq("id", accountId).maybeSingle();
  if (!account) return { ok: false, reason: "account-not-found" };
  const decision = decidePromotion(account.role as Role | null);

  if (decision === "refuse-admin") return { ok: false, reason: "is-admin" };
  if (decision === "refuse-mentor") return { ok: false, reason: "is-mentor" };
  if (decision === "already-sales-agent") return { ok: false, reason: "already-sales-agent" };

  // Guard on the role we just evaluated so a concurrent admin/mentor promotion
  // between the read and this write can never be overwritten.
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ role: "sales_agent" })
    .eq("id", accountId)
    .eq("role", account.role)
    .select("id");
  if (error || !updated || updated.length === 0) return { ok: false, reason: "db-error" };
  return { ok: true };
}

export type RemoveResult = { ok: true; released: number } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Removes sales access. Order matters:
 *  1. release the agent's contacts to unclaimed,
 *  2. revert the role to 'student' (guarded on role = 'sales_agent', so it can
 *     never demote an admin or mentor even if their role changed meanwhile),
 *  3. sweep once more, because the agent could still claim a contact between
 *     steps 1 and 2 while their role still reached the workspace.
 * After step 2 the account can no longer claim anything, so the sweep is final.
 * If step 2 fails the role is untouched and the call can simply be retried.
 */
export async function removeSalesAgent(profileId: string): Promise<RemoveResult> {
  const admin = createAdminSupabase();

  const { data: profile } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!profile || profile.role !== "sales_agent") return { ok: false, reason: "not-found" };

  const release = () =>
    admin.from("contacts").update({ owner_id: null, claimed_at: null }).eq("owner_id", profileId).select("id");

  const first = await release();
  if (first.error) return { ok: false, reason: "db-error" };

  const { data: demoted, error: roleError } = await admin
    .from("profiles")
    .update({ role: "student" })
    .eq("id", profileId)
    .eq("role", "sales_agent")
    .select("id");
  if (roleError) return { ok: false, reason: "db-error" };
  if (!demoted || demoted.length === 0) return { ok: false, reason: "not-found" };

  const second = await release();
  if (second.error) return { ok: false, reason: "db-error" };

  return { ok: true, released: (first.data?.length ?? 0) + (second.data?.length ?? 0) };
}
