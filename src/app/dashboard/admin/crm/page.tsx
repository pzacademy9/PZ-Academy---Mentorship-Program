import { redirect } from "next/navigation";
import { legacyCrmTabTarget } from "@/lib/crm/sales-hub-routes";

export default async function LegacyCrmPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(legacyCrmTabTarget(tab));
}
