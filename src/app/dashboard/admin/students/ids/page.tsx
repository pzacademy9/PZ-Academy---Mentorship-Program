import { requireAdminPage } from "@/lib/auth/require-admin";
import { StudentsTabs } from "@/components/admin/students/StudentsTabs";
import { PeopleLookup } from "@/components/admin/people/PeopleLookup";
import { findPeopleAction, mergePeopleAction } from "./actions";

export const metadata = { title: "Student IDs — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <StudentsTabs active="ids" />
      <div>
        <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Student IDs</h1>
        <p className="mt-1 text-sm text-pz-on-surface-variant">
          Find a student by PZ ID, old ID, email or name. If the same student has two IDs, merge them into one.
        </p>
      </div>
      <PeopleLookup search={findPeopleAction} merge={mergePeopleAction} />
    </div>
  );
}
