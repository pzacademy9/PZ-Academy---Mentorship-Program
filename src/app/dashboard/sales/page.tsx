import { ClipboardList } from "lucide-react";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Sales Workspace — PZ Academy" };

export default async function SalesWorkspacePage() {
  await requireSalesAgentPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Today</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Your daily workspace for messaging contacts.</p>
      </div>
      <EmptyState
        icon={ClipboardList}
        title="Your workspace is being set up"
        description="Your contacts and tools will appear here soon. Nothing is needed from you yet."
      />
    </div>
  );
}
