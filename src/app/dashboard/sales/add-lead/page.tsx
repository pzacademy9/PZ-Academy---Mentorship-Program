import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { AddLeadForm } from "@/components/sales/AddLeadForm";

export const metadata = { title: "Add a Lead — Sales Workspace" };

export default async function AddLeadPage() {
  await requireSalesAgentPage();
  return <AddLeadForm />;
}
