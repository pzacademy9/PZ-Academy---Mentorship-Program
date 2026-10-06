import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCampaigns } from "@/lib/data/admin-crm-campaigns";
import { listWhatsAppBatches } from "@/lib/data/admin-crm-whatsapp";
import { ConversionPanel, type ConversionTrackedItem } from "@/components/admin/crm/ConversionPanel";

export const metadata = { title: "Conversion — Sales Hub — PZ Academy" };

export default async function SalesHubConversionPage() {
  await requireAdminPage();
  const [whatsappBatches, campaigns] = await Promise.all([listWhatsAppBatches(), listCampaigns()]);

  const conversionItems: ConversionTrackedItem[] = [
    ...whatsappBatches
      .filter((b) => b.conversionTag.kind !== "none" && b.conversion !== null)
      .map((b) => ({
        kind: "whatsapp" as const,
        id: b.id,
        name: b.name,
        conversionTag: b.conversionTag,
        conversionCourseTitle: b.conversionCourseTitle,
        conversion: b.conversion!,
      })),
    ...campaigns
      .filter((c) => c.conversionTag.kind !== "none" && c.conversion !== null)
      .map((c) => ({
        kind: "campaign" as const,
        id: c.id,
        name: c.name,
        conversionTag: c.conversionTag,
        conversionCourseTitle: c.conversionCourseTitle,
        conversion: c.conversion!,
      })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Conversion</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">See how campaigns and batches convert into enrolments.</p>
      </div>
      <ConversionPanel items={conversionItems} />
    </div>
  );
}
