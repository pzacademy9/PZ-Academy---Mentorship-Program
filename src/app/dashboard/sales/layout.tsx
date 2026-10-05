import { Suspense } from "react";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";
import { WelcomeTour } from "@/components/sales/WelcomeTour";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireSalesAgentPage();
  const metadataSeen = Boolean((user.user_metadata as Record<string, unknown> | undefined)?.sales_tour_seen_at);
  return (
    <SalesBudgetProvider>
      <div className="space-y-6 font-body">
        <BudgetBar />
        {children}
      </div>
      <Suspense fallback={null}>
        <WelcomeTour role={role} metadataSeen={metadataSeen} />
      </Suspense>
    </SalesBudgetProvider>
  );
}
