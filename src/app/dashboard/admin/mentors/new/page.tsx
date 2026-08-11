import { requireAdminPage } from "@/lib/auth/require-admin";
import { NewMentorForm } from "@/components/admin/mentors/NewMentorForm";

export const metadata = { title: "New Mentor — PZ Academy" };

export default async function NewMentorPage() {
  await requireAdminPage();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">New Mentor</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Pick a name — everything else is filled in on the next screen.
        </p>
      </div>
      <NewMentorForm />
    </div>
  );
}
