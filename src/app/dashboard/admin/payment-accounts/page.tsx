import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAllPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import { listPaymentCountries } from "@/lib/data/landing-payment-countries";
import { PaymentAccountsManager } from "@/components/admin/payments/PaymentAccountsManager";

export const metadata = { title: "Payment accounts — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentAccountsPage() {
  await requireAdminPage();
  const [countries, accounts] = await Promise.all([listPaymentCountries(), listAllPaymentAccounts()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Payment accounts</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Where students send their fees, by country. Change an account here once and every landing page for that country, and its emails, use the new details.
        </p>
      </div>
      <PaymentAccountsManager countries={countries} accounts={accounts} />
    </div>
  );
}
