import { requireAdminPage } from "@/lib/auth/require-admin";
import { masterPrompt } from "@/lib/landing/import/prompts";
import { MakeWithAi } from "@/components/admin/landing/MakeWithAi";

export const metadata = { title: "Make a page with AI — PZ Academy" };

export default async function MakeWithAiPage() {
  await requireAdminPage();
  const prompts = {
    course: masterPrompt("course"),
    workshop: masterPrompt("workshop"),
    webinar: masterPrompt("webinar"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Make a page with AI</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Let an AI chat interview you and write the page for you.
        </p>
      </div>
      <MakeWithAi prompts={prompts} />
    </div>
  );
}
