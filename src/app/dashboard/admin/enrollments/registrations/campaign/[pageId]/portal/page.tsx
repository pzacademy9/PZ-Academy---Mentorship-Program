import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { getPortalOverview } from "@/lib/data/portals";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { PortalAccessScreen } from "@/components/admin/registrations/PortalAccessScreen";

export const metadata = { title: "Portal access — PZ Academy" };

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PortalAccessPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage("enrollments");

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const page = pages.find((p) => p.id === pageId);
  if (!page) notFound();
  const overview = await getPortalOverview(pageId);

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />
      <PortalAccessScreen pageId={pageId} pageTitle={page.title} overview={overview} />
    </div>
  );
}
