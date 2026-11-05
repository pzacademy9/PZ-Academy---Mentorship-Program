import { requireAdminPage } from "@/lib/auth/require-admin";
import { exampleFile, improvePrompt, masterPrompt, pagePrompt } from "@/lib/lms/course-import/prompts";
import { CourseAiPrompts } from "@/components/admin/program/CourseAiPrompts";

export const metadata = { title: "Make a course page with AI — PZ Academy" };

export default async function CourseAiPage() {
  await requireAdminPage("courses");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Make a course page with AI</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Copy the instructions into your AI chat. It gives you one file to import.
        </p>
      </div>
      <CourseAiPrompts prompts={{ whole: masterPrompt(), page: pagePrompt(), improve: improvePrompt() }} example={exampleFile()} />
    </div>
  );
}
