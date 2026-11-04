import { requireSuperAdminPage } from "@/lib/auth/require-admin";
import { listTeam } from "@/lib/data/team-access";
import { TeamManager } from "@/components/admin/team/TeamManager";

export const metadata = { title: "Team — PZ Academy" };

export default async function AdminTeamPage() {
  await requireSuperAdminPage();
  const members = await listTeam();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Team</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Choose who helps run PZ Academy and what each person can open. Only you can see this page.
        </p>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
