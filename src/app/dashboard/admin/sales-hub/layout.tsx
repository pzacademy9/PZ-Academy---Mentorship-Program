import { requireAdminPage } from "@/lib/auth/require-admin";

export default async function SalesHubLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
