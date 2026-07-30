import { requireAdminPage } from "@/lib/auth/require-admin";
import { ConnectSheetForm } from "@/components/admin/ConnectSheetForm";

export const metadata = { title: "Sheet Sync — PZ Academy" };

export default async function AdminSheetSyncPage() {
  const { supabase } = await requireAdminPage();

  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, sheet_id")
    .order("title");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Sheet Sync</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Connect a course to its WordPress-fed Google Sheet. One shared sync script serves every
          sheet — this is the entire setup for a new batch.
        </p>
      </div>

      <ConnectSheetForm
        courses={(courses ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          sheetId: c.sheet_id,
        }))}
      />
    </div>
  );
}
