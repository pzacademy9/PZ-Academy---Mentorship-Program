import { requireAdminPage } from "@/lib/auth/require-admin";
import { listWhatsAppBatches } from "@/lib/data/admin-crm-whatsapp";
import { WhatsAppPanel } from "@/components/admin/crm/WhatsAppPanel";

export const metadata = { title: "WhatsApp — Sales Hub — PZ Academy" };

export default async function SalesHubWhatsAppPage() {
  await requireAdminPage();
  const whatsappBatches = await listWhatsAppBatches();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">WhatsApp</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">WhatsApp batches for your contacts.</p>
      </div>
      <WhatsAppPanel initialBatches={whatsappBatches} />
    </div>
  );
}
