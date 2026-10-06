import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getSalesHubOverview } from "@/lib/data/sales-hub-overview";
import { hubOverviewCards } from "@/lib/crm/sales-hub-overview";

export const metadata = { title: "Sales Hub — PZ Academy" };

export default async function AdminSalesHubPage() {
  await requireAdminPage();
  const cards = hubOverviewCards(await getSalesHubOverview());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Sales Hub</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Contacts, assignment, your sales team and WhatsApp safety, all in one place.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl bg-pz-surface-container p-5 hover:bg-pz-surface-container-high transition-colors"
          >
            <p className="font-body text-sm text-pz-on-surface-variant">{c.label}</p>
            <p
              className={`font-headline font-black text-3xl tabular-nums mt-1 ${
                c.tone === "warn" ? "text-pz-danger" : "text-pz-secondary"
              }`}
            >
              {c.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
