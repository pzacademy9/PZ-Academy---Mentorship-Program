import { requireAdminPage } from "@/lib/auth/require-admin";
import { masterPrompt } from "@/lib/lms/course-import/prompts";
import { CourseImport } from "@/components/admin/program/CourseImport";

export const metadata = { title: "Build a course from a file — PZ Academy" };

export default async function CourseImportPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Build a course from a file</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Let an AI chat put your course material into one file, then create a draft course from it.
        </p>
      </div>
      <CourseImport prompt={masterPrompt()} />
    </div>
  );
}
