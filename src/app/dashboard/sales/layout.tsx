import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireSalesAgentPage();
  return (
    <SalesBudgetProvider>
      <div className="space-y-6 font-body">
        <BudgetBar />
        {children}
      </div>
    </SalesBudgetProvider>
  );
}
