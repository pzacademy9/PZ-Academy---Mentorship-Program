import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCampaigns } from "@/lib/data/participant-campaigns";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { CampaignList } from "@/components/admin/registrations/CampaignList";

export const metadata = { title: "Page Registrations — PZ Academy" };

// Payment status changes from a dialog on these pages: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminRegistrationsCampaignsPage() {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();
  const campaigns = await listCampaigns();

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />
      <CampaignList campaigns={campaigns} />
    </div>
  );
}
