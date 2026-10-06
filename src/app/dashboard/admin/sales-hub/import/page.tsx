import { requireAdminPage } from "@/lib/auth/require-admin";
import { ImportWizard } from "@/components/admin/crm/ImportWizard";

export const metadata = { title: "Import — Sales Hub — PZ Academy" };

export default async function SalesHubImportPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Import</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Import past buyers from Google Sheets.</p>
      </div>
      <ImportWizard />
    </div>
  );
}
