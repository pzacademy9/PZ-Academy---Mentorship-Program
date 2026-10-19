import { notFound } from "next/navigation";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getRegistrationDetail, type Scope } from "@/lib/data/landing-registration-admin";
import { RegistrationDetailView } from "@/components/admin/registrations/RegistrationDetailView";

export const metadata = { title: "Registration — Sales Workspace" };

export default async function SalesRegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, role } = await requireSalesAgentPage();
  const { id } = await params;

  // Agents only ever see their own registrations: another agent's id is a plain 404.
  const isAgent = role === "sales_agent";
  const scope: Scope = isAgent ? { kind: "agent", agentId: user.id } : { kind: "all" };
  const detail = await getRegistrationDetail(id, scope);
  if (!detail) notFound();

  return (
    <RegistrationDetailView
      detail={detail}
      backHref="/dashboard/sales/registrations"
      backLabel="Back to my registrations"
      endpoint={`/api/sales/registrations/${detail.lead.id}`}
      showAgent={!isAgent}
      changeNote={isAgent ? "Your changes are saved with your name." : undefined}
    />
  );
}
