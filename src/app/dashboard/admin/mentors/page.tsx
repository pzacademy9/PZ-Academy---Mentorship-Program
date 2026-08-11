import { requireAdminPage } from "@/lib/auth/require-admin";
import { listMentorsForAdmin } from "@/lib/data/admin-mentors";
import { MentorRegistryTable } from "@/components/admin/mentors/MentorRegistryTable";

export const metadata = { title: "Mentors — PZ Academy" };

export default async function AdminMentorsPage() {
  await requireAdminPage();
  const { rows, stats } = await listMentorsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Mentor Registry</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Create and manage the mentors shown on the public /mentorship page.
        </p>
      </div>

      <MentorRegistryTable rows={rows} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Total Mentors</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.total}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Published</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.published}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Draft</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.draft}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Hidden</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.hidden}</p>
        </div>
      </div>
    </div>
  );
}
