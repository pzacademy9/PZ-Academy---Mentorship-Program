import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { BatchAccessPanel } from "@/components/admin/registrations/BatchAccessPanel";

export const metadata = { title: "Batch Access — PZ Academy" };

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BatchAccessPage() {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();
  const pageOptions = await listRegistrationPageOptions();

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-headline font-semibold">
        <Link
          href="/dashboard/admin/enrollments/registrations"
          className="text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          Page Registrations
        </Link>
        <span className="text-pz-outline-variant" aria-hidden="true">/</span>
        <span className="text-pz-primary bg-pz-primary-fixed/40 px-2.5 py-0.5 rounded-full">Batch Access</span>
      </nav>
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Batch Access</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1 max-w-2xl">
          Open course modules for your students once a live session is over. Everyone who has paid gets the portal link by email.
        </p>
      </div>
      <BatchAccessPanel pageOptions={pageOptions} />
    </div>
  );
}
