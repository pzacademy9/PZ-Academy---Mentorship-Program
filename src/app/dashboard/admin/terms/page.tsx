import { requireAdminPage } from "@/lib/auth/require-admin";
import { getGeneralTerms } from "@/lib/data/site-terms";
import { GeneralTermsEditor } from "@/components/admin/terms/GeneralTermsEditor";

export const metadata = { title: "Terms and Conditions — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminTermsPage() {
  await requireAdminPage();
  const body = await getGeneralTerms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Terms and Conditions</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          The general Terms for your landing pages. Each landing page can also have its own Terms in its Page settings.
        </p>
      </div>
      <GeneralTermsEditor initial={body} />
    </div>
  );
}
