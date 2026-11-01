import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { listBatchIdRowsWithScope } from "@/lib/data/pz-people";
import { StudentIdsPanel } from "@/components/admin/ids/StudentIdsPanel";

export const metadata = { title: "Student IDs — PZ Academy" };

// IDs change as people enrol: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/dashboard/admin/enrollments/registrations";

export default async function AdminStudentIdsPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  if (!campaign) notFound();

  const rows = await listBatchIdRowsWithScope(pageId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base text-pz-on-surface-variant">{campaign.title}</p>
        </div>
        <Link
          href={`${BASE}/campaign/${pageId}`}
          className="inline-flex min-h-12 items-center text-base font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
        >
          Back to registrations
        </Link>
      </div>
      <StudentIdsPanel pageTitle={campaign.title} rows={rows} />
    </div>
  );
}
