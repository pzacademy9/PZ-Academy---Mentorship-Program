import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getAgentDetail } from "@/lib/data/admin-crm-agents";
import { AgentDetailClient } from "@/components/admin/crm/AgentDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentDetail(id);
  return { title: agent ? `${agent.name} — PZ Academy CRM` : "Agent — PZ Academy CRM" };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const agent = await getAgentDetail(id);
  if (!agent) notFound();

  return <AgentDetailClient agent={agent} />;
}
