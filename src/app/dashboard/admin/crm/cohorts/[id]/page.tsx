import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getCohortDetail } from "@/lib/data/admin-crm-import";
import { CohortDetailClient } from "@/components/admin/crm/CohortDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cohort = await getCohortDetail(id);
  return { title: cohort ? `${cohort.sheetName} — PZ Academy CRM` : "Cohort — PZ Academy CRM" };
}

export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const cohort = await getCohortDetail(id);
  if (!cohort) notFound();

  return <CohortDetailClient cohort={cohort} />;
}
