import Link from "next/link";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listContacts, listMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { listCampaigns } from "@/lib/data/admin-crm-campaigns";
import { listCohorts } from "@/lib/data/admin-crm-import";
import { listWhatsAppBatches } from "@/lib/data/admin-crm-whatsapp";
import { listAgents } from "@/lib/data/admin-crm-agents";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import { ImportWizard } from "@/components/admin/crm/ImportWizard";
import { MergeReviewPanel } from "@/components/admin/crm/MergeReviewPanel";
import { CampaignsPanel } from "@/components/admin/crm/CampaignsPanel";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import { WhatsAppPanel } from "@/components/admin/crm/WhatsAppPanel";
import { ConversionPanel, type ConversionTrackedItem } from "@/components/admin/crm/ConversionPanel";
import { AgentsPanel } from "@/components/admin/crm/AgentsPanel";

export const metadata = { title: "CRM — PZ Academy" };

type Tab = "contacts" | "import" | "merge" | "campaigns" | "cohorts" | "whatsapp" | "conversion" | "agents";

function parseTab(value: string | undefined): Tab {
  if (value === "import") return "import";
  if (value === "merge") return "merge";
  if (value === "campaigns") return "campaigns";
  if (value === "cohorts") return "cohorts";
  if (value === "whatsapp") return "whatsapp";
  if (value === "conversion") return "conversion";
  if (value === "agents") return "agents";
  return "contacts";
}

const TAB_CLASS = (active: boolean) =>
  `px-5 py-2 rounded-full font-headline text-sm transition-all ${
    active
      ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
      : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"
  }`;

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const [contacts, mergeCandidates, campaigns, cohorts, whatsappBatches, agents] = await Promise.all([
    listContacts({ limit: 50, offset: 0 }),
    listMergeCandidates(),
    listCampaigns(),
    listCohorts(),
    listWhatsAppBatches(),
    listAgents(),
  ]);

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
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">CRM</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Import past buyers from Google Sheets, resolve duplicates, and see purchase history.
        </p>
      </div>

      <ChipTabs label="CRM sections">
        <Link href="/dashboard/admin/crm?tab=contacts" className={TAB_CLASS(tab === "contacts")} aria-current={tab === "contacts" ? "page" : undefined}>
          Contacts <span className="ml-2 tabular-nums">{contacts.total}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=import" className={TAB_CLASS(tab === "import")} aria-current={tab === "import" ? "page" : undefined}>
          Import
        </Link>
        <Link href="/dashboard/admin/crm?tab=merge" className={TAB_CLASS(tab === "merge")} aria-current={tab === "merge" ? "page" : undefined}>
          Merge Review <span className="ml-2 tabular-nums">{mergeCandidates.length}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=campaigns" className={TAB_CLASS(tab === "campaigns")} aria-current={tab === "campaigns" ? "page" : undefined}>
          Campaigns
        </Link>
        <Link href="/dashboard/admin/crm?tab=cohorts" className={TAB_CLASS(tab === "cohorts")} aria-current={tab === "cohorts" ? "page" : undefined}>
          Cohorts <span className="ml-2 tabular-nums">{cohorts.length}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=whatsapp" className={TAB_CLASS(tab === "whatsapp")} aria-current={tab === "whatsapp" ? "page" : undefined}>
          WhatsApp <span className="ml-2 tabular-nums">{whatsappBatches.length}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=conversion" className={TAB_CLASS(tab === "conversion")} aria-current={tab === "conversion" ? "page" : undefined}>
          Conversion
        </Link>
        <Link href="/dashboard/admin/crm?tab=agents" className={TAB_CLASS(tab === "agents")} aria-current={tab === "agents" ? "page" : undefined}>
          Agents <span className="ml-2 tabular-nums">{agents.length}</span>
        </Link>
      </ChipTabs>

      {tab === "contacts" && <ContactsPanel initialRows={contacts.rows} initialTotal={contacts.total} />}
      {tab === "import" && <ImportWizard />}
      {tab === "merge" && <MergeReviewPanel initialCandidates={mergeCandidates} />}
      {tab === "campaigns" && <CampaignsPanel initialCampaigns={campaigns} />}
      {tab === "cohorts" && <CohortsPanel initialCohorts={cohorts} />}
      {tab === "whatsapp" && <WhatsAppPanel initialBatches={whatsappBatches} />}
      {tab === "conversion" && <ConversionPanel items={conversionItems} />}
      {tab === "agents" && <AgentsPanel initialAgents={agents} />}
    </div>
  );
}
