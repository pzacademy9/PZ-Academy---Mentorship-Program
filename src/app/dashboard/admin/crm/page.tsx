import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listContacts, listMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { listCampaigns } from "@/lib/data/admin-crm-campaigns";
import { listCohorts } from "@/lib/data/admin-crm-import";
import { listWhatsAppBatches } from "@/lib/data/admin-crm-whatsapp";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import { ImportWizard } from "@/components/admin/crm/ImportWizard";
import { MergeReviewPanel } from "@/components/admin/crm/MergeReviewPanel";
import { CampaignsPanel } from "@/components/admin/crm/CampaignsPanel";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import { WhatsAppPanel } from "@/components/admin/crm/WhatsAppPanel";

export const metadata = { title: "CRM — PZ Academy" };

type Tab = "contacts" | "import" | "merge" | "campaigns" | "cohorts" | "whatsapp";

function parseTab(value: string | undefined): Tab {
  if (value === "import") return "import";
  if (value === "merge") return "merge";
  if (value === "campaigns") return "campaigns";
  if (value === "cohorts") return "cohorts";
  if (value === "whatsapp") return "whatsapp";
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

  const [contacts, mergeCandidates, campaigns, cohorts, whatsappBatches] = await Promise.all([
    listContacts({ limit: 50, offset: 0 }),
    listMergeCandidates(),
    listCampaigns(),
    listCohorts(),
    listWhatsAppBatches(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">CRM</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Import past buyers from Google Sheets, resolve duplicates, and see purchase history.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/dashboard/admin/crm?tab=contacts" className={TAB_CLASS(tab === "contacts")}>
          Contacts <span className="ml-2 tabular-nums">{contacts.total}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=import" className={TAB_CLASS(tab === "import")}>
          Import
        </Link>
        <Link href="/dashboard/admin/crm?tab=merge" className={TAB_CLASS(tab === "merge")}>
          Merge Review <span className="ml-2 tabular-nums">{mergeCandidates.length}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=campaigns" className={TAB_CLASS(tab === "campaigns")}>
          Campaigns
        </Link>
        <Link href="/dashboard/admin/crm?tab=cohorts" className={TAB_CLASS(tab === "cohorts")}>
          Cohorts <span className="ml-2 tabular-nums">{cohorts.length}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=whatsapp" className={TAB_CLASS(tab === "whatsapp")}>
          WhatsApp <span className="ml-2 tabular-nums">{whatsappBatches.length}</span>
        </Link>
      </div>

      {tab === "contacts" && <ContactsPanel initialRows={contacts.rows} initialTotal={contacts.total} />}
      {tab === "import" && <ImportWizard />}
      {tab === "merge" && <MergeReviewPanel initialCandidates={mergeCandidates} />}
      {tab === "campaigns" && <CampaignsPanel initialCampaigns={campaigns} />}
      {tab === "cohorts" && <CohortsPanel initialCohorts={cohorts} />}
      {tab === "whatsapp" && <WhatsAppPanel initialBatches={whatsappBatches} />}
    </div>
  );
}
