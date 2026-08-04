import { requireAdminPage } from "@/lib/auth/require-admin";
import { NewCourseForm } from "@/components/admin/program/NewCourseForm";

export const metadata = { title: "New Program — PZ Academy" };

export default async function NewCoursePage() {
  await requireAdminPage();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">New Program</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Pick a title and type — everything else is filled in on the next screen.
        </p>
      </div>
      <NewCourseForm />
    </div>
  );
}
