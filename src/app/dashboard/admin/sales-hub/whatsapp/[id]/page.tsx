import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getWhatsAppBatchDetail } from "@/lib/data/admin-crm-whatsapp";
import { listContactIdsWithManualConversion } from "@/lib/data/admin-crm-manual-conversions";
import { WhatsAppBatchDetailClient } from "@/components/admin/crm/WhatsAppBatchDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getWhatsAppBatchDetail(id);
  return { title: batch ? `${batch.name} — PZ Academy CRM` : "WhatsApp Batch — PZ Academy CRM" };
}

export default async function WhatsAppBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getWhatsAppBatchDetail(id);
  if (!detail) notFound();

  const contactIds = detail.recipients.map((r) => r.contactId).filter((id): id is string => id !== null);
  const manualConvertedContactIds = await listContactIdsWithManualConversion(contactIds);

  return <WhatsAppBatchDetailClient initialDetail={detail} manualConvertedContactIds={Array.from(manualConvertedContactIds)} />;
}
