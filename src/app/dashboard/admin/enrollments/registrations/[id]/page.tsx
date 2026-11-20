import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getRegistrationDetail } from "@/lib/data/landing-registration-admin";
import { backTarget } from "@/lib/registrations/back-link";
import { RegistrationDetailView } from "@/components/admin/registrations/RegistrationDetailView";

export const metadata = { title: "Registration Detail — PZ Academy" };

// Payment status changes from a dialog on these pages: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminRegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requireAdminPage("enrollments");

  const { id } = await params;
  const { from } = await searchParams;
  const detail = await getRegistrationDetail(id, { kind: "all" });
  if (!detail) notFound();

  return (
    <RegistrationDetailView
      detail={detail}
      backHref={backTarget(from)}
      backLabel="Back to registrations"
      endpoint={`/api/admin/registrations/${detail.lead.id}`}
      showAgent
    />
  );
}
