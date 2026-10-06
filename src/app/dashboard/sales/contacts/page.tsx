import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { ContactsWorkspace } from "@/components/sales/ContactsWorkspace";
import { getAgentsCanClaim } from "@/lib/data/sales-assignment";

export const metadata = { title: "My Contacts — Sales Workspace" };

const TABS = ["mine", "unclaimed", "all"] as const;
type Tab = (typeof TABS)[number];

// Same searchParams convention as src/app/dashboard/admin/sales-hub/contacts/page.tsx (a Promise, awaited).
export default async function SalesContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; open?: string }>;
}) {
  const { user, role } = await requireSalesAgentPage();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "mine";
  const open = sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null;
  // Admins are exempt from the claim setting server-side, so their UI always offers Claim.
  const canClaim = role === "admin" ? true : await getAgentsCanClaim();
  return <ContactsWorkspace viewerId={user.id} initialTab={tab} initialOpenId={open} canClaim={canClaim} />;
}
