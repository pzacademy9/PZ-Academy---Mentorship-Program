import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getContactDetail } from "@/lib/data/admin-crm-contacts";
import { listManualConversions } from "@/lib/data/admin-crm-manual-conversions";
import { ContactDetailClient } from "@/components/admin/crm/ContactDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactDetail(id);
  return { title: contact ? `${contact.fullName || contact.email || "Contact"} — PZ Academy CRM` : "Contact — PZ Academy CRM" };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) notFound();

  const manualConversions = await listManualConversions(id);

  return <ContactDetailClient detail={detail} initialManualConversions={manualConversions} />;
}
