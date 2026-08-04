import { requireAdminPage } from "@/lib/auth/require-admin";
import { listPrograms } from "@/lib/data/admin-lms";
import { ProgramLibraryTable } from "@/components/admin/program/ProgramLibraryTable";

export const metadata = { title: "Programs — PZ Academy" };

export default async function AdminProgramsPage() {
  await requireAdminPage();
  const { rows, stats } = await listPrograms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Course Manager</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Select a program to view and edit its details.
        </p>
      </div>

      <ProgramLibraryTable rows={rows} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Published Programs</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.published}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Avg Pricing</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">PKR {stats.avgPricePkr.toLocaleString()}</p>
        </div>
        <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">Draft Entries</p>
          <p className="font-headline text-2xl font-bold text-pz-primary mt-1">{stats.draft}</p>
        </div>
      </div>
    </div>
  );
}
