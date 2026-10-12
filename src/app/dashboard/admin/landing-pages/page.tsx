import { requireAdminPage } from "@/lib/auth/require-admin";
import { listLandingPages } from "@/lib/data/landing-pages";
import { LandingPagesList } from "@/components/admin/landing/LandingPagesList";

export const metadata = { title: "Landing Pages — PZ Academy" };

export default async function AdminLandingPagesPage() {
  await requireAdminPage();
  const pages = await listLandingPages();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Landing Pages</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Build and publish registration pages for your courses, workshops and webinars.
        </p>
      </div>
      <LandingPagesList pages={pages} />
    </div>
  );
}
