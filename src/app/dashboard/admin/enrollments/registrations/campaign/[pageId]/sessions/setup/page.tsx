import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { SetupForm } from "@/components/admin/classes/SetupForm";
import { loadSetup } from "../setup-actions";

export const metadata = { title: "Set up classes — PZ Academy" };

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/dashboard/admin/enrollments/registrations";

export default async function SetupClassesPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const state = await loadSetup(pageId);
  if (!state) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Set up classes</h1>
          <p className="text-base text-pz-on-surface-variant">{state.title}</p>
        </div>
        <Link
          href={`${BASE}/campaign/${pageId}/sessions`}
          className="inline-flex min-h-12 items-center text-base font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
        >
          Back to classes
        </Link>
      </div>
      <SetupForm pageId={pageId} state={state} />
    </div>
  );
}
